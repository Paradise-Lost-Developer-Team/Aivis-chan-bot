import { Client, GatewayIntentBits, ActivityType, MessageFlags, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { deployCommands } from "./utils/deploy-commands";
import { REST } from "@discordjs/rest";
import { getUserTierByOwnership, getGuildTier } from "./utils/patreonIntegration";
import * as fs from "fs";
import * as path from "path";
import { AivisAdapter, loadAutoJoinChannels, loadSpeakers, fetchAndSaveSpeakers, loadUserVoiceSettings, setTextChannelForGuildInMap, removeTextChannelForGuildInMap, removeTextChannelByVoiceChannelId } from "./utils/TTS-Engine";
import { ServerStatus, fetchUUIDsPeriodically } from "./utils/dictionaries";
import { MessageCreate } from "./utils/MessageCreate";
import { VoiceStateUpdate } from "./utils/VoiceStateUpdate";
import { logError } from "./utils/errorLogger";
import { reconnectToVoiceChannels } from './utils/voiceStateManager';
import { orchestrateReconnectFromSavedState } from './utils/reconnectOrchestrator';
import { ConversationTrackingService } from "./utils/conversation-tracking-service"; // 会話分析サービス
import { VoiceStampManager, setupVoiceStampEvents } from "./utils/voiceStamp"; // ボイススタンプ機能をインポート
import { initSentry } from './utils/sentry';
import { VoiceConnection, VoiceConnectionStatus, entersState } from "@discordjs/voice";
import express from 'express';
import axios from 'axios';

// アプリケーション起動の最初にSentryを初期化
initSentry();

// 相対パス (プロジェクトルート) を使うよう変更
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
    console.log(`データディレクトリを作成します: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_PATH = path.resolve(process.cwd(), 'data', 'config.json');

function safeLoadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('config.json の読み込みで問題が発生しました。環境変数にフォールバックします。', e);
    }
    return {
        TOKEN: process.env.DISCORD_TOKEN || process.env.TOKEN || '',
        clientId: process.env.CLIENT_ID || '',
        PATREON: {
            CLIENT_ID: process.env.PATREON_CLIENT_ID || '',
            CLIENT_SECRET: process.env.PATREON_CLIENT_SECRET || '',
            REDIRECT_URI: process.env.PATREON_REDIRECT_URI || ''
        },
        sentry: {
            dsn: process.env.SENTRY_DSN || '',
            enabled: process.env.SENTRY_ENABLED ? process.env.SENTRY_ENABLED === 'true' : false
        },
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GENAI_API_KEY || ''
    };
}

const CONFIG = safeLoadConfig();
const { TOKEN } = CONFIG;

export interface ExtendedClient extends Client {
    commands: Collection<string, any>;
}

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] }) as ExtendedClient;
client.commands = new Collection(); // コマンド用の Collection を作成

const rest = new REST({ version: '9' }).setToken(TOKEN);

// 未処理の例外をハンドリング
process.on('uncaughtException', (error) => {
    console.error('未処理の例外が発生しました：', error);
    logError('uncaughtException', error);
    // クラッシュが深刻な場合は再起動させる（PM2が再起動を担当）
    if (error.message.includes('FATAL') || error.message.includes('CRITICAL')) {
        console.error('深刻なエラーのため、プロセスを終了します。');
        process.exit(1);
    }
});

// 未処理のPromiseリジェクトをハンドリング
process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromiseリジェクションが発生しました：', reason);
    logError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

// グレースフルシャットダウン処理
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function gracefulShutdown() {
    console.log('シャットダウン中...');
    // voice connectionsはclient.destroy()で自動的に切断される
    
    // Discordクライアントからログアウト
    await client.destroy();
    console.log('正常にシャットダウンしました');
    process.exit(0);
}

client.once("ready", async () => {
    try {
        // 起動時にAivisSpeech Engineから話者情報を取得しspeakers.jsonに保存
        await fetchAndSaveSpeakers();

        await deployCommands(client);
        console.log("コマンドのデプロイ完了");
        
    // 再接続はオーケストレーションで最も空いている在籍Botへ
    console.log('再接続オーケストレーションを開始...');
    await orchestrateReconnectFromSavedState(client);
    console.log('再接続オーケストレーションが完了しました');

        // --- 追加: 各ギルドのVoiceConnectionがReadyになるまで待機 ---
        const { voiceClients } = await import('./utils/TTS-Engine');
        const waitForReady = async (vc: VoiceConnection, guildId: string) => {
            try {
                await entersState(vc, VoiceConnectionStatus.Ready, 10_000);
            } catch (e) {
                console.warn(`ギルド${guildId}のVoiceConnectionがReadyになりませんでした:`, e);
            }
        };
        for (const [guildId, vc] of Object.entries(voiceClients) as [string, VoiceConnection][]) {
            if (vc && vc.state.status !== VoiceConnectionStatus.Ready) {
                await waitForReady(vc, guildId);
            }
        }
        // --- 追加ここまで ---
        
        // 会話統計トラッキングサービスの初期化
        console.log("会話分析サービスを初期化しています...");
        const conversationTrackingService = ConversationTrackingService.getInstance(client);
        conversationTrackingService.setupEventListeners();
        console.log("会話分析サービスの初期化が完了しました");
        
        // ボイススタンプ機能の初期化
        console.log("ボイススタンプ機能を初期化しています...");
        const voiceStampManager = VoiceStampManager.getInstance(client);
        setupVoiceStampEvents(client);
        console.log("ボイススタンプ機能の初期化が完了しました");
        
        // TTS関連の初期化を先に実行
        console.log("TTS初期化中...");
        loadAutoJoinChannels();
        loadSpeakers();
        loadUserVoiceSettings();
        
        console.log("TTS初期化完了");

        // Webダッシュボードから設定を読み込み
        await loadWebDashboardSettings();

        // 定期的に設定を再読み込み（30分ごと）
        setInterval(async () => {
            try {
                await loadWebDashboardSettings();
            } catch (error) {
                console.error('定期設定読み込みでエラー:', error);
            }
        }, 30 * 60 * 1000); // 30分

        AivisAdapter();
        console.log("AivisAdapter初期化完了");
        
        // 再接続が完了した後で他の機能を初期化
        MessageCreate(client);
        VoiceStateUpdate(client);
        console.log("起動完了");
        client.user!.setActivity("起動完了", { type: ActivityType.Playing });
        
        // 辞書データ関連の処理を後で行う（エラーがあっても再接続には影響しない）
        try {
            fetchUUIDsPeriodically();
        } catch (dictError) {
            console.error("辞書データ取得エラー:", dictError);
            logError('dictionaryError', dictError instanceof Error ? dictError : new Error(String(dictError)));
        }
        
        client.guilds.cache.forEach(guild => {
            try {
                new ServerStatus(guild.id); // 各ギルドのIDを保存するタスクを開始
            } catch (error) {
                console.error(`Guild ${guild.id} のステータス初期化エラー:`, error);
                logError('serverStatusError', error instanceof Error ? error : new Error(String(error)));
            }
        });

        // クラスター内Botの /internal/info を叩いてVC合計を集計
        const BOTS = [
            { name: 'pro-premium', baseUrl: 'http://aivis-chan-bot-pro-premium:3012' },
            { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd:3003' },
            { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd:3004' },
            { name: '4th', baseUrl: 'http://aivis-chan-bot-4th:3005' },
            { name: '5th', baseUrl: 'http://aivis-chan-bot-5th:3006' },
            { name: '6th', baseUrl: 'http://aivis-chan-bot-6th:3007' }
        ];

    async function getClusterVCCount(selfCount: number, timeoutMs = 5000): Promise<number> {
            try {
        const results: number[] = await Promise.all(BOTS.map(async b => {
                    try {
                        console.log(`[cluster:pro] VC数取得開始: ${b.name} (${b.baseUrl})`);
            const { data } = await axios.get<{ vcCount?: number }>(`${b.baseUrl}/internal/info`, { 
                            timeout: timeoutMs,
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'ClusterVCCounter-Pro/1.0'
                            }
                        });
                        const vcCount = (typeof data?.vcCount === 'number') ? (data.vcCount as number) : 0;
                        console.log(`[cluster:pro] VC数取得成功: ${b.name} -> ${vcCount}`);
            return vcCount;
                    } catch (error: any) {
                        console.warn(`[cluster:pro] VC数取得失敗: ${b.name} -> ${error.message || error}`);
                        return 0;
                    }
                }));
        const sum = results.reduce((a: number, c: number) => a + c, 0);
                console.log(`[cluster:pro] 総VC数: ${sum} (自身: ${selfCount})`);
                return Math.max(sum, selfCount);
            } catch (error) {
                console.error(`[cluster:pro] getClusterVCCount全体エラー: ${error}`);
                return selfCount;
            }
        }

        setInterval(async () => {
            try {
                const joinServerCount = client.guilds.cache.size;
                const selfVC = client.voice.adapters.size;
                const totalVC = await getClusterVCCount(selfVC);
                client.user!.setActivity(`/help | VC接続中: ${selfVC}/${totalVC} | サーバー数: ${joinServerCount} | Ping: ${client.ws.ping}ms`, { type: ActivityType.Custom });
            } catch (error) {
                console.error("ステータス更新エラー:", error);
                logError('statusUpdateError', error instanceof Error ? error : new Error(String(error)));
            }
        }, 30000);

        // Patreonチェックを定期的に実行
        setInterval(async () => {
            try {
                // 全てのサーバーに対してPatreonチェックを実行
                for (const guild of client.guilds.cache.values()) {
                    const { checkPatreonInBackground } = await import('./utils/subscription');
                    await checkPatreonInBackground(guild.id);
                }
            } catch (error) {
                console.error("Patreonチェックエラー:", error);
                logError('patreonCheckError', error instanceof Error ? error : new Error(String(error)));
            }
        }, 3600000); // 1時間ごとに実行
    } catch (error) {
        console.error("Bot起動エラー:", error);
        logError('botStartupError', error instanceof Error ? error : new Error(String(error)));
    }
});

client.on("interactionCreate", async interaction => {
    try {
        // スラッシュコマンド処理
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            
            // --- 有料版ゲート: subscription / patreon 以外は Pro/Premium 必須 ---
            try {
                const name = interaction.commandName?.toLowerCase?.() || '';
                const bypass = name === 'subscription' || name === 'patreon';
                if (!bypass) {
                    // サーバー所有者のPatreon連携状態をチェック
                    let hasAccess = false;
                    if (interaction.guildId) {
                        const guildTier = await getGuildTier(interaction.guildId, client);
                        if (guildTier === 'pro' || guildTier === 'premium') {
                            hasAccess = true;
                        }
                    }

                    if (!hasAccess) {
                        await interaction.reply({
                            content: 'このBotは有料版です。利用にはサーバー所有者のPatreon連携（ProもしくはPremium）が必要です。\nサーバー所有者が `/patreon link` で連携し、`/subscription info` で詳細をご確認ください。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                }
            } catch (authErr) {
                console.error('認証チェックエラー:', authErr);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '認証チェック中にエラーが発生しました。しばらくしてからお試しください。',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch {}
                return;
            }
            // --- ゲートここまで ---

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`コマンド実行エラー (${interaction.commandName}):`, error);
                
                // インタラクションの応答状態に基づいて適切に対応
                if (interaction.replied || interaction.deferred) {
                    try {
                        await interaction.followUp({ 
                            content: 'コマンド実行時にエラーが発生しました', 
                            flags: MessageFlags.Ephemeral 
                        });
                    } catch (e: any) {
                        if (e.code !== 10062) // Unknown interaction以外のエラーのみログ
                            console.error("FollowUp失敗:", e);
                    }
                } else {
                    try {
                        await interaction.reply({ 
                            content: 'コマンド実行時にエラーが発生しました', 
                            flags: MessageFlags.Ephemeral 
                        });
                    } catch (e: any) {
                        if (e.code !== 10062) // Unknown interaction以外のエラーのみログ
                            console.error("Reply失敗:", e);
                    }
                }
            }
        }
        
        // ボタンインタラクション処理
        else if (interaction.isButton()) {
            console.log(`ボタン押下: ${interaction.customId}`);
            
            // helpコマンドのボタン処理
            if (interaction.customId.startsWith('previous_') || interaction.customId.startsWith('next_')) {
                const helpCommand = require('./commands/utility/help');
                await helpCommand.buttonHandler(interaction);
            }
            // 他のボタンハンドラーはここに追加
        }
    } catch (error) {
        console.error('インタラクション処理エラー:', error);
    }
});

client.on("guildCreate", async (guild) => {
    try {
        const embed = new EmbedBuilder()
            .setTitle('Aivis Chan Bot（Pro/Premium版）が導入されました！')
            .setDescription('Aivis Chan Botを導入いただきありがとうございます。Discordサーバーにてメッセージ読み上げ等を行う便利BOTです。')
            .addFields(
            { name: '本アカウントについて', value: 'このBotインスタンスは Pro / Premium 向けの有料版です。利用には Patreon 連携で Pro もしくは Premium の購読が必要になります。`/patreon link` で連携、`/subscription info` で詳細をご確認ください。' },
            { name: 'BOTの概要', value: '音声合成を活用した読み上げBotです。多彩な話者やエフェクトを使えます。' },
            { name: '主要特徴', value: '• カスタマイズ可能な読み上げ\n• 豊富な音声エフェクト\n• カスタム辞書の登録' },
            { name: '基本コマンド', value: '• /help\n• /join\n• /leave' }
            )
            .setFooter({ text: 'Powered by AivisSpeech — Pro/Premium edition' })
            .setColor(0x00AAFF);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('利用規約')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Term-of-Service'),
                new ButtonBuilder()
                    .setLabel('プライバシーポリシー')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Privacy-Policy'),
                new ButtonBuilder()
                    .setLabel('サポートサーバー')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://discord.gg/c4TrxUD5XX')
            );

        const systemChannel = guild.systemChannel;
        if (systemChannel && systemChannel.isTextBased()) {
            await systemChannel.send({ embeds: [embed], components: [row] });
        }
    } catch (error) {
        console.error('Error sending welcome embed:', error);
    }
});

// --- サーバー数・VC数API ---
const apiApp = express();
apiApp.use(express.json());
import { Request, Response } from 'express';
apiApp.get('/api/stats', (req: Request, res: Response) => {
    const serverCount = client.guilds.cache.size;
    const vcCount = client.voice.adapters.size;
    // 全サーバーのメンバー数合計
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount ?? 0), 0);
    // シャード数（shard情報があれば）
    const shardCount = client.shard?.count ?? 1;
    // 稼働率: ボイスチャンネル接続数 ÷ サーバー数（%表示）
    const uptimeRate = serverCount > 0 ? Math.round((vcCount / serverCount) * 100) : 0;

    res.json({ serverCount, userCount, shardCount, vcCount, uptimeRate });
});
apiApp.listen(3012, () => {
    console.log('Stats APIサーバーがポート3012で起動しました');
});
// --- ここまで追加 ---

// 即座に設定をリロードするエンドポイント
apiApp.post('/internal/reload-settings', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, settingsType } = req.body;
        
        console.log(`即座に設定リロード要求受信 - Guild: ${guildId}, Type: ${settingsType}`);
        
        // 全ギルドの設定をリロード
        await loadWebDashboardSettings();
        
        console.log(`設定リロード完了 - Guild: ${guildId || 'ALL'}`);
        return res.json({ success: true, message: 'Settings reloaded successfully' });
    } catch (error) {
        console.error('設定リロードエラー:', error);
        return res.status(500).json({ error: 'Failed to reload settings' });
    }
});

client.login(TOKEN).catch(error => {
    console.error("ログインエラー:", error);
    logError('loginError', error);
    process.exit(1);
});
// 内部用: 設定バンドル (config.json 等の秘匿ファイルは除外)
apiApp.get('/internal/settings/bundle', (req: Request, res: Response) => {
    try {
        const dir = path.resolve(process.cwd(), 'data');
        if (!fs.existsSync(dir)) return res.json({ files: {} });
        const entries = fs.readdirSync(dir);
        const files: Record<string, any> = {};
        for (const name of entries) {
            if (!name.endsWith('.json')) continue;
            const lower = name.toLowerCase();
            if (lower === 'config.json') continue; // token等を含むため除外
            if (lower === 'voice_state.json') continue; // 一時的な音声状態は共有しない
            if (lower === 'auto_join_channels.json') continue; // 自動参加設定は1台目のみが保持・使用
            const full = path.join(dir, name);
            try {
                const txt = fs.readFileSync(full, 'utf8');
                files[name] = JSON.parse(txt);
            } catch (e) {
                // パースできない場合はスキップ
            }
        }
        res.json({ files });
    } catch (e) {
        console.error('settings bundle error:', e);
        res.status(500).json({ error: 'settings-bundle-failed' });
    }
});

// --- 内部: 指定ギルド/チャンネルへ参加API & info ---
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { textChannels, voiceClients } from './utils/TTS-Engine';
import { saveVoiceState, getTextChannelForGuild, setTextChannelForGuild } from './utils/voiceStateManager';

/**
 * ローカル実装: voiceChannelId または guildId を受け取り、
 * 関連する接続/マッピング/プレイヤーを破棄して削除します。
 */
function cleanupAudioResources(identifier: string) {
    try {
        // 直接のvoice接続があれば破棄
        try {
            const direct = getVoiceConnection(identifier);
            if (direct) {
                try { direct.destroy(); } catch (_) { /* ignore */ }
            }
        } catch (_) { /* ignore */ }

        // voiceClientsに直接キーとして存在する場合の削除（voiceChannelIdケース）
        try {
            if ((voiceClients as any)[identifier]) {
                try { (voiceClients as any)[identifier].destroy?.(); } catch (_) { /* ignore */ }
                try { delete (voiceClients as any)[identifier]; } catch (_) { /* ignore */ }
            }
        } catch (_) { /* ignore */ }

        // guildIdが渡された場合はvoiceClients内を探索してguildIdに紐づく接続を破棄
        try {
            for (const key of Object.keys(voiceClients)) {
                const conn = (voiceClients as any)[key];
                // joinConfigは @discordjs/voice の内部構造に依存するため存在確認を行う
                const connGuildId = conn?.joinConfig?.guildId ?? conn?.guildId ?? null;
                if (connGuildId && connGuildId === identifier) {
                    try { conn.destroy?.(); } catch (_) { /* ignore */ }
                    try { delete (voiceClients as any)[key]; } catch (_) { /* ignore */ }
                }
            }
        } catch (_) { /* ignore */ }

        // テキストチャンネルのマッピングを削除 (互換ヘルパ経由)
        try {
            try { removeTextChannelForGuildInMap(identifier); } catch (_) { /* ignore */ }
        } catch (_) { /* ignore */ }

        // グローバルプレイヤーがあれば削除
        try {
            if ((global as any).players) {
                if ((global as any).players[identifier]) {
                    try { delete (global as any).players[identifier]; } catch (_) { /* ignore */ }
                }
                for (const key of Object.keys((global as any).players)) {
                    if (key === identifier) {
                        try { delete (global as any).players[key]; } catch (_) { /* ignore */ }
                    }
                }
            }
        } catch (_) { /* ignore */ }
    } catch (e) {
        console.warn('cleanupAudioResources error:', e);
    }
}

apiApp.post('/internal/join', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId, textChannelId, requestingChannelId } = req.body || {};
        if (!guildId || !voiceChannelId) return res.status(400).json({ error: 'guildId and voiceChannelId are required' });
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });
        const voiceChannel = guild.channels.cache.get(voiceChannelId) as any;
        if (!voiceChannel || voiceChannel.type !== 2) return res.status(400).json({ error: 'voice-channel-invalid' });

        // テキストチャンネルの決定ロジック
        // Priority order:
        // 1) explicit textChannelId from request
        // 2) requestingChannelId (the channel where command was invoked) if provided and valid
        // 3) saved mapping getTextChannelForGuild
        let finalTextChannelId: string | null = textChannelId || null;

        // If no explicit textChannelId, prefer requestingChannelId (command invocation channel)
        if (!finalTextChannelId && requestingChannelId) {
            try {
                const maybe = guild.channels.cache.get(requestingChannelId) || await guild.channels.fetch(requestingChannelId).catch(() => null);
                if (maybe && maybe.type === 0) {
                    // Ensure the bot can send messages in this channel
                    const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                    const perms = me ? maybe.permissionsFor(me) : null;
                    if (!perms || perms.has('SendMessages')) {
                        finalTextChannelId = requestingChannelId;
                        console.log(`[internal/join] using requestingChannelId as text channel: ${requestingChannelId}`);
                    } else {
                        console.warn(`[internal/join] requestingChannelId exists but bot lacks send permission: ${requestingChannelId}`);
                    }
                } else {
                    console.warn(`[internal/join] requestingChannelId invalid or not a text channel: ${requestingChannelId}`);
                }
            } catch (err) {
                console.error(`[internal/join] error validating requestingChannelId ${requestingChannelId}:`, err);
            }
        }

        if (!finalTextChannelId) finalTextChannelId = getTextChannelForGuild(guildId) || null;

        if (!finalTextChannelId) {
            const { autoJoinChannels } = await import('./utils/TTS-Engine');
            const autoJoinSetting = autoJoinChannels[guildId];
            if (autoJoinSetting && autoJoinSetting.textChannelId) finalTextChannelId = autoJoinSetting.textChannelId;
        }
        if (!finalTextChannelId) {
            const { joinChannels } = await import('./utils/TTS-Engine');
            const joinSetting = joinChannels[guildId];
            if (joinSetting && joinSetting.textChannelId) finalTextChannelId = joinSetting.textChannelId;
        }
        // Fallback: if still no text channel, try to find a text channel related to the voice channel
        if (!finalTextChannelId) {
            try {
                const voiceChannelObj = guild.channels.cache.get(voiceChannelId) as any;
                if (voiceChannelObj) {
                    const candidates: any[] = [];
                    // 1) same category text channels
                    if (voiceChannelObj.parentId) {
                        for (const ch of guild.channels.cache.values()) {
                            try {
                                if (ch.type === 0 && (ch as any).parentId === voiceChannelObj.parentId) candidates.push(ch);
                            } catch (_) { continue; }
                        }
                    }
                    // 2) same-name text channel (fallback)
                    if (candidates.length === 0) {
                        try {
                            const sameName = guild.channels.cache.find((c: any) => c.type === 0 && typeof c.name === 'string' && c.name.toLowerCase() === (voiceChannelObj.name || '').toLowerCase());
                            if (sameName) candidates.push(sameName);
                        } catch (_) { /* ignore */ }
                    }

                    if (candidates.length > 0) {
                        const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                        for (const cand of candidates) {
                            try {
                                const perms = me ? (cand as any).permissionsFor(me) : null;
                                if (!perms || perms.has('SendMessages')) {
                                    finalTextChannelId = cand.id;
                                    console.log(`[internal/join] fallback selected text channel: ${cand.name} (${cand.id}) for voice ${voiceChannelId}`);
                                    break;
                                }
                            } catch (e) { continue; }
                        }
                    }
                }
            } catch (e) {
                console.warn('[internal/join] fallback selection error:', e);
            }
        }
        // Fallback: try to pick a sensible text channel related to the voice channel
        // - same category text channels
        // - text channel with same name as the voice channel
        // Only pick if bot has SendMessages permission in that channel
        if (!finalTextChannelId) {
            try {
                const voiceChannelObj = guild.channels.cache.get(voiceChannelId) as any;
                if (voiceChannelObj) {
                    const candidates: any[] = [];
                    // same category
                    if (voiceChannelObj.parentId) {
                        for (const ch of guild.channels.cache.values()) {
                            try {
                                if (ch.type === 0 && (ch as any).parentId === voiceChannelObj.parentId) candidates.push(ch);
                            } catch (_) { continue; }
                        }
                    }
                    // if none found, try same-name text channel
                    if (candidates.length === 0) {
                        try {
                            const sameName = guild.channels.cache.find((c: any) => c.type === 0 && typeof c.name === 'string' && c.name.toLowerCase() === (voiceChannelObj.name || '').toLowerCase());
                            if (sameName) candidates.push(sameName);
                        } catch (_) { /* ignore */ }
                    }

                    // choose the first candidate where bot can send messages
                    if (candidates.length > 0) {
                        const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                        for (const cand of candidates) {
                            try {
                                const perms = me ? (cand as any).permissionsFor(me) : null;
                                if (!perms || perms.has('SendMessages')) {
                                    finalTextChannelId = cand.id;
                                    console.log(`[internal/join] fallback selected text channel: ${cand.name} (${cand.id}) for voice ${voiceChannelId}`);
                                    break;
                                }
                            } catch (e) { continue; }
                        }
                    }
                }
            } catch (e) {
                console.warn('[internal/join] fallback selection error:', e);
            }
        }
        // Do NOT fall back to system/general/first channels here.
        // If finalTextChannelId is still not set, leave it null and do not attempt to auto-select.

        // テキストチャンネルをフェッチしてマップに設定（見つからなければフォールバック探索）
        let tc: any = null;
        if (finalTextChannelId) {
            try {
                console.log(`[internal/join] attempting to fetch text channel id=${finalTextChannelId} for guild=${guildId}`);
                tc = guild.channels.cache.get(finalTextChannelId) as any;
                if (!tc) tc = await guild.channels.fetch(finalTextChannelId).catch(() => null);
                if (tc && tc.type === 0) {
                    try { setTextChannelForGuildInMap(guildId, tc as any, false); } catch (_) { /* ignore */ }
                    console.log(`[internal/join] 成功: ギルド ${guildId} のテキストチャンネルを設定: ${tc.name} (${finalTextChannelId})`);
                } else {
                    console.warn(`[internal/join] テキストチャンネル設定失敗: ギルド ${guildId} チャンネル ${finalTextChannelId} - 存在: ${!!tc}, タイプ: ${tc?.type}`);
                    // Do not attempt a fallback selection. Leave finalTextChannelId null and proceed.
                }
            } catch (error) {
                console.error(`[internal/join] テキストチャンネル設定エラー: ギルド ${guildId}:`, error);
            }
        }

        // 既存のvoiceClientsをvoiceChannelIdで管理
            const prev = getVoiceConnection(voiceChannelId);
            if (prev) {
                try { prev.destroy(); } catch {}
                try { delete (voiceClients as any)[voiceChannelId]; } catch {}
                try { delete (voiceClients as any)[guildId]; } catch {}
            }
            const connection = joinVoiceChannel({ channelId: voiceChannelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
            // Store under both voiceChannelId and guildId for compatibility with VoiceStateUpdate and other modules
            try { (voiceClients as any)[voiceChannelId] = connection; } catch {}
            try { (voiceClients as any)[guildId] = connection; } catch {}
        setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 1000);

        // 即時応答: 後続の announce と埋め込み送信は非同期で実行
        try {
            res.json({
                ok: true,
                textChannelId: finalTextChannelId,
                message: finalTextChannelId ? 'ボイスチャンネルに参加し、テキストチャンネルを設定しました' : 'ボイスチャンネルに参加しましたが、テキストチャンネルが見つかりませんでした'
            });
        } catch (e) {
            console.warn('[internal/join:pro-premium] 応答送信エラー:', e);
        }

        (async () => {
            try {
                const { speakAnnounce } = await import('./utils/TTS-Engine');
                try {
                    console.log(`[internal/join:pro-premium] (async) 音声アナウンス開始: ギルド ${guildId}`);
                    await speakAnnounce('接続しました', voiceChannelId, client);
                    console.log(`[internal/join:pro-premium] (async) 音声アナウンス再生完了: ギルド ${guildId} チャンネル ${voiceChannelId}`);
                } catch (voiceAnnounceError) {
                    console.error(`[internal/join:pro-premium] (async) 音声アナウンスエラー: ギルド ${guildId} チャンネル ${voiceChannelId}:`, voiceAnnounceError);
                }

                // embed送信も非同期で行う
                try {
                    if (tc && tc.isTextBased && tc.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle('✅ ボイスチャンネル接続完了')
                            .setDescription(`<#${voiceChannelId}> に参加しました。`)
                            .addFields(
                                { name: '接続先', value: `<#${voiceChannelId}>`, inline: true },
                                { name: 'テキストチャンネル', value: `<#${finalTextChannelId}>`, inline: true }
                            )
                            .setColor(0x00ff00)
                            .setThumbnail(client.user?.displayAvatarURL() ?? null)
                            .setTimestamp();
                        await tc.send({ embeds: [embed] }).catch(() => {});
                        console.log(`[internal/join:pro-premium] (async) アナウンス送信完了: ギルド ${guildId} チャンネル ${finalTextChannelId}`);
                    }
                } catch (announceError) {
                    console.error(`[internal/join:pro-premium] (async) アナウンス送信エラー: ギルド ${guildId}:`, announceError);
                }
            } catch (e) {
                console.error('[internal/join:pro-premium] (async) エラー:', e);
            }
        })();
        return;
    } catch (e) {
        console.error('internal/join error:', e);
        return res.status(500).json({ error: 'join-failed' });
    }
});

apiApp.get('/internal/info', async (req: Request, res: Response) => {
    try {
        const guildIds = Array.from(client.guilds.cache.keys());
        const connectedGuildIds = Object.keys(voiceClients);
        return res.json({ botId: client.user?.id, botTag: client.user?.tag, guildIds, connectedGuildIds, vcCount: client.voice.adapters.size, serverCount: client.guilds.cache.size });
    } catch (e) {
        console.error('internal/info error:', e);
        return res.status(500).json({ error: 'info-failed' });
    }
});

// テキストチャンネル決定API（他のBotが使用）
apiApp.get('/internal/text-channel/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        const requestingChannelId = (req.query.requestingChannelId as string) || null;
        const voiceChannelId = (req.query.voiceChannelId as string) || null;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });

        // ギルドのTier情報を取得
        const { getGuildTier } = await import('./utils/patreonIntegration');
        const guildTier = await getGuildTier(guildId, client);

        let finalTextChannelId: string | null = null;
        let reason: string | null = null;

        // 1) invocation/requesting channel (highest priority)
        if (!finalTextChannelId && requestingChannelId) {
            try {
                const maybe = guild.channels.cache.get(requestingChannelId) || await guild.channels.fetch(requestingChannelId).catch(() => null);
                if (maybe && (maybe as any).type === 0) {
                    const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                    const perms = me ? (maybe as any).permissionsFor(me) : null;
                    if (!perms || perms.has('SendMessages')) { finalTextChannelId = requestingChannelId; reason = 'requestingChannel'; }
                    else reason = 'requestingChannel_no_permission';
                } else {
                    reason = 'requestingChannel_invalid';
                }
            } catch (err) { console.warn('[text-channel API:pro-premium] requestingChannel validation error', err); }
        }

        // 2) saved mapping (in-memory)
        if (!finalTextChannelId) {
            try {
                const saved = getTextChannelForGuild(guildId) || null;
                if (saved) { finalTextChannelId = saved; reason = 'savedMapping'; }
            } catch (err) { /* ignore */ }
        }

        // 3) autoJoin settings
        if (!finalTextChannelId) {
            try {
                const { autoJoinChannels } = await import('./utils/TTS-Engine');
                const auto = autoJoinChannels[guildId];
                if (auto && auto.textChannelId) { finalTextChannelId = auto.textChannelId; reason = 'autoJoin'; }
            } catch (err) { /* ignore */ }
        }

        // 4) joinChannels setting
        if (!finalTextChannelId) {
            try {
                const { joinChannels } = await import('./utils/TTS-Engine');
                const js = joinChannels[guildId];
                if (js && js.textChannelId) { finalTextChannelId = js.textChannelId; reason = 'joinChannels'; }
            } catch (err) { /* ignore */ }
        }

        // 5) voice-related fallback (only if voiceChannelId provided)
        if (!finalTextChannelId && voiceChannelId) {
            try {
                const voiceObj = guild.channels.cache.get(voiceChannelId) || await guild.channels.fetch(voiceChannelId).catch(() => null);
                if (voiceObj) {
                    const candidates: any[] = [];
                    if ((voiceObj as any).parentId) {
                        for (const ch of guild.channels.cache.values()) {
                            try { if ((ch as any).type === 0 && (ch as any).parentId === (voiceObj as any).parentId) candidates.push(ch); } catch (_) { }
                        }
                    }
                    if (candidates.length === 0) {
                        const sameName = guild.channels.cache.find((c: any) => c.type === 0 && typeof c.name === 'string' && c.name.toLowerCase() === (voiceObj as any).name?.toLowerCase?.());
                        if (sameName) candidates.push(sameName);
                    }
                    if (candidates.length > 0) {
                        const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                        for (const cand of candidates) {
                            try { const perms = me ? (cand as any).permissionsFor(me) : null; if (!perms || perms.has('SendMessages')) { finalTextChannelId = cand.id; reason = 'voiceFallback'; break; } } catch (e) { continue; }
                        }
                    } else { reason = 'noCandidatesFromVoice'; }
                } else { reason = 'voiceChannelNotFound'; }
            } catch (err) { console.warn('[text-channel API:pro-premium] voiceFallback error', err); }
        }

        if (finalTextChannelId) {
            try {
                const tc = await guild.channels.fetch(finalTextChannelId).catch(() => null);
                if (tc && (tc as any).type === 0) {
                    return res.json({ ok: true, textChannelId: finalTextChannelId, textChannelName: (tc as any).name, guildTier, reason });
                } else {
                    const cachedChannel = guild.channels.cache.get(finalTextChannelId) as any;
                    if (cachedChannel && cachedChannel.type === 0) {
                        return res.json({ ok: true, textChannelId: finalTextChannelId, textChannelName: cachedChannel.name, guildTier, reason });
                    }
                    return res.status(404).json({ error: 'text-channel-invalid', reason });
                }
            } catch (fetchError) {
                console.error('[text-channel API:pro-premium] channel fetch error:', fetchError);
                return res.status(500).json({ error: 'channel-fetch-failed', details: { guildId, channelId: finalTextChannelId }, reason });
            }
        }

        return res.status(404).json({ error: 'no-text-channel-found', guildTier, reason });
    } catch (e) {
        console.error('text-channel API error:', e);
        return res.status(500).json({ error: 'text-channel-failed' });
    }
});

// Solana: Invoice作成はWebサーバー側で行うように変更しました。
// ここは非推奨のエンドポイントであり、利用を避けてください。
apiApp.post('/internal/solana/create-invoice', async (req: Request, res: Response) => {
    try {
        return res.status(410).json({ error: 'create-invoice-deprecated', message: 'Create invoices via the web service /internal/solana/create-invoice' });
    } catch (e: any) {
        console.error('create-invoice deprecate error:', e);
        return res.status(500).json({ error: 'create-invoice-failed' });
    }
});

// Solana: トランザクション検証
apiApp.post('/internal/solana/verify', async (req: Request, res: Response) => {
    try {
        const { signature, invoiceId, expectedLamports } = req.body || {};
        if (!signature || !invoiceId || typeof expectedLamports !== 'number') return res.status(400).json({ error: 'invalid-params' });
        const { verifyTransaction } = await import('./utils/solanaPayments');
        const ok = await verifyTransaction(signature, expectedLamports);
        if (!ok) return res.status(400).json({ error: 'verification-failed' });

        // TODO: 実際のアカウント付与や内部処理をここに追加
        console.log(`Solana payment verified for invoice ${invoiceId} signature ${signature}`);
        return res.json({ ok: true });
    } catch (e: any) {
        console.error('verify error:', e);
        return res.status(500).json({ error: 'verify-failed' });
    }
});

apiApp.post('/internal/leave', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId } = req.body || {};
        if (!guildId && !voiceChannelId) return res.status(400).json({ error: 'guildId or voiceChannelId is required' });

        // voiceChannelId が指定されていればそれを優先してクリーンアップを行う
        if (voiceChannelId) {
            try { cleanupAudioResources(voiceChannelId); } catch (e) { console.warn('cleanupAudioResources by voiceChannelId failed', e); }
            try { delete (voiceClients as any)[voiceChannelId]; } catch (e) { /* ignore */ }
            // voiceChannelId が渡された場合は、voiceChannelId キーで登録されたテキストチャンネルの削除を行う
            try { removeTextChannelByVoiceChannelId(voiceChannelId); } catch (e) { /* ignore */ }
            try { delete (global as any).players?.[voiceChannelId]; } catch (e) { /* ignore */ }
        } else if (guildId) {
            // 従来互換性のため guildId ベースのクリーンアップも保持
            try { cleanupAudioResources(guildId); } catch (e) { console.warn('cleanupAudioResources by guildId failed', e); }
            try { delete (voiceClients as any)[guildId]; } catch (e) { /* ignore */ }
            try { removeTextChannelForGuildInMap(guildId); } catch (e) { /* ignore */ }
            try { delete (global as any).players?.[guildId]; } catch (e) { /* ignore */ }
        }

        setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 500);
        return res.json({ ok: true });
    } catch (e) {
        console.error('internal/leave error:', e);
        return res.status(500).json({ error: 'leave-failed' });
    }
});

// Webダッシュボードから設定を読み込む関数
async function loadWebDashboardSettings() {
    try {
        console.log('Webダッシュボードから設定を読み込んでいます...');
        
        // Web ダッシュボードサービスのURL
        const webDashboardUrl = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web.aivis-chan-bot-web.svc.cluster.local';
        
        // 各ギルドの設定を読み込み
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
            try {
                // サーバー設定を読み込み（タイムアウト時間を15秒に延長）
                const settingsResponse = await axios.get(`${webDashboardUrl}/internal/settings/${guildId}`, {
                    timeout: 15000
                });
                
                if (settingsResponse.data && settingsResponse.data.settings) {
                    console.log(`ギルド ${guild.name} (${guildId}) の設定を読み込みました:`, settingsResponse.data.settings);
                    // ここで設定を適用する処理を追加
                    applyGuildSettings(guildId, settingsResponse.data.settings);
                }
                
                // 辞書設定を読み込み（global-dictionary エンドポイントを使用）
                try {
                    const fetcher = await import('./utils/global-dictionary-client');
                    const merged = await fetcher.fetchAndMergeGlobalDictionary(guildId, webDashboardUrl);
                    if (merged && merged.length) {
                        console.log(`ギルド ${guild.name} (${guildId}) の辞書を読み込みました (merged):`, merged.length, '件');
                        applyGuildDictionary(guildId, merged);
                    } else {
                        // 空の場合は従来のエンドポイントを試す（後方互換）
                        const dictionaryResponse = await axios.get(`${webDashboardUrl}/internal/dictionary/${guildId}`, { timeout: 15000 });
                        if (dictionaryResponse.data && dictionaryResponse.data.dictionary) {
                            console.log(`ギルド ${guild.name} (${guildId}) の辞書を読み込みました (fallback):`, dictionaryResponse.data.dictionary.length, '件');
                            applyGuildDictionary(guildId, dictionaryResponse.data.dictionary);
                        }
                    }
                } catch (dictClientErr) {
                    console.warn('global-dictionary client error, falling back to legacy dictionary endpoint:', dictClientErr);
                    try {
                        const dictionaryResponse = await axios.get(`${webDashboardUrl}/internal/dictionary/${guildId}`, { timeout: 15000 });
                        if (dictionaryResponse.data && dictionaryResponse.data.dictionary) {
                            applyGuildDictionary(guildId, dictionaryResponse.data.dictionary);
                        }
                    } catch (e) {
                        console.warn('fallback dictionary fetch failed:', e);
                    }
                }
                
            } catch (guildError: any) {
                console.log(`ギルド ${guildId} の設定読み込みをスキップ: ${guildError?.message || guildError}`);
            }
        }
        
        console.log('Webダッシュボード設定の読み込みが完了しました');
    } catch (error: any) {
        console.error('Webダッシュボード設定の読み込みに失敗:', error?.message || error);
    }
}

// ギルド設定を適用する関数
function applyGuildSettings(guildId: string, settings: any) {
    try {
        // 設定ファイルに保存
        const settingsDir = path.join(DATA_DIR, 'guild-settings');
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        
        const settingsFile = path.join(settingsDir, `${guildId}.json`);
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
        
        console.log(`ギルド ${guildId} の設定を保存しました`);
    } catch (error) {
        console.error(`ギルド ${guildId} の設定適用に失敗:`, error);
    }
}

// ギルド辞書を適用する関数
function applyGuildDictionary(guildId: string, dictionary: any[]) {
    try {
        const dictionariesPath = path.join(DATA_DIR, 'guild_dictionaries.json');
        let guildDictionaries: Record<string, any> = {};
        if (fs.existsSync(dictionariesPath)) {
            try {
                guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
            } catch (e) {
                console.warn('Failed to parse existing dictionaries:', e);
            }
        }

        // 辞書エントリーを適切な形式に変換（TTS-Engine用のObject形式）
        const convertedDictionary: Record<string, any> = {};
        dictionary.forEach((entry: any) => {
            if (entry.word && entry.pronunciation) {
                convertedDictionary[entry.word] = {
                    pronunciation: entry.pronunciation,
                    accent: entry.accent || '',
                    wordType: entry.wordType || ''
                };
            }
        });

        guildDictionaries[guildId] = convertedDictionary;
        fs.writeFileSync(dictionariesPath, JSON.stringify(guildDictionaries, null, 2));
        
        console.log(`ギルド ${guildId} の辞書を保存しました (${dictionary.length}件)`);
    } catch (error) {
        console.error(`ギルド ${guildId} の辞書適用に失敗:`, error);
    }
}