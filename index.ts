import { Client, GatewayIntentBits, ActivityType, MessageFlags, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { deployCommands } from "./utils/deploy-commands";
import { REST } from "@discordjs/rest";
import { getUserTierByOwnership, getGuildTier } from "./utils/patreonIntegration";
import * as fs from "fs";
import * as path from "path";
import { AivisAdapter, loadAutoJoinChannels, loadSpeakers, fetchAndSaveSpeakers, loadUserVoiceSettings, updateJoinChannelsConfig } from "./utils/TTS-Engine";
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

// アプリケーション起動初期に、開発者が管理するサーバーを自動的に Premium 扱いにする（ローカルオーバーライド）
// 環境変数: DEVELOPER_DISCORD_ID に開発者のDiscordユーザーIDを設定してください。
// getUserTierByOwnership の返り値形式が環境により異なる可能性があるため、複数の形に対応します。
(async () => {
    try {
        const developerId = process.env.DEVELOPER_DISCORD_ID || process.env.DEV_ID || '809627147333140531';
        if (!developerId) {
            console.log('[patreon-override] DEVELOPER_DISCORD_ID が設定されていません。スキップします。');
            return;
        }
        if (typeof getUserTierByOwnership !== 'function') {
            console.warn('[patreon-override] getUserTierByOwnership が見つかりません。スキップします。');
            return;
        }

        console.log('[patreon-override] 開発者の所有サーバーを取得中...', developerId);
        let res;
        try {
            // 実装によっては第二引数に client を要求することもあるため、まず userId のみで試行
            res = await (getUserTierByOwnership as any)(developerId);
        } catch (err) {
            // もし署名が (client, userId) の場合に備えて、失敗したら undefined として続行（呼び出し側で対応することが望ましい）
            console.warn('[patreon-override] getUserTierByOwnership 呼び出しでエラー:', err);
            res = undefined;
        }

        // 返り値の解析（可能な形式に対応）
        let guildIds: string[] = [];
        if (Array.isArray(res)) {
            guildIds = res;
        } else if (res && Array.isArray((res as any).guildIds)) {
            guildIds = (res as any).guildIds;
        } else if (res && Array.isArray((res as any).ownedGuilds)) {
            guildIds = (res as any).ownedGuilds;
        } else if (res && typeof res === 'object') {
            // object の場合はキーを guildId とみなす（例: { guildId: 'premium', ... }）
            guildIds = Object.keys(res);
        }

        if (guildIds.length === 0) {
            console.log('[patreon-override] 開発者所有のギルドが見つかりませんでした。オーバーライドは行いません。');
            return;
        }

        // data/patreon_overrides.json に guildId -> 'premium' を保存（既存ファイルはマージ）
        const overridesPath = path.resolve(process.cwd(), 'data', 'patreon_overrides.json');
        let existing: Record<string, any> = {};
        try {
            if (fs.existsSync(overridesPath)) {
                const txt = fs.readFileSync(overridesPath, 'utf8');
                existing = txt ? JSON.parse(txt) : {};
            }
        } catch (e) {
            console.warn('[patreon-override] 既存オーバーライド読み込み失敗:', e);
        }

        for (const gid of guildIds) {
            existing[gid] = 'premium';
        }

        try {
            fs.mkdirSync(path.dirname(overridesPath), { recursive: true });
            fs.writeFileSync(overridesPath, JSON.stringify(existing, null, 2), 'utf8');
            console.log('[patreon-override] 開発者所有ギルドをプレミアム扱いとして保存しました:', guildIds);
        } catch (e) {
            console.error('[patreon-override] オーバーライド書き込み失敗:', e);
        }
    } catch (e) {
        console.error('[patreon-override] 想定外のエラー:', e);
    }
})();
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

// Webダッシュボードの設定を読み込む関数
async function loadWebDashboardSettings() {
    const webBaseUrl = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web.aivis-chan-bot-web.svc.cluster.local';
    
    try {
        // 全ギルドの設定を読み込み
        for (const guild of client.guilds.cache.values()) {
            try {
                // タイムアウト時間を15秒に延長し、エラーハンドリングを改善
                const timeout = 15000;
                const axiosConfig = { timeout };
                
                const settingsResponse = await axios.get(`${webBaseUrl}/internal/settings/${guild.id}`, axiosConfig);
                const dictionaryResponse = await axios.get(`${webBaseUrl}/internal/dictionary/${guild.id}`, axiosConfig);

                // 設定を適用
                if (settingsResponse.data?.settings) {
                    const { voiceSettings } = await import('./utils/TTS-Engine');
                    const settings = settingsResponse.data.settings;
                    
                    if (!voiceSettings[guild.id]) {
                        voiceSettings[guild.id] = {};
                    }
                    
                    // ダッシュボードのTTS設定を反映（autoLeave / ignoreBots を追加）
                    Object.assign(voiceSettings[guild.id], {
                        defaultSpeaker: settings.defaultSpeaker,
                        defaultSpeed: settings.defaultSpeed,
                        defaultPitch: settings.defaultPitch,
                        defaultTempo: settings.defaultTempo,
                        defaultVolume: settings.defaultVolume,
                        defaultIntonation: settings.defaultIntonation,
                        autoLeave: typeof settings.autoLeave === 'boolean' ? settings.autoLeave : voiceSettings[guild.id].autoLeave,
                        ignoreBots: typeof settings.ignoreBots === 'boolean' ? settings.ignoreBots : voiceSettings[guild.id].ignoreBots
                    });

                    // 即時反映：メモリ上のユーザー/ギルド設定をリロード
                    try {
                        await loadUserVoiceSettings();
                        console.log(`[loadWebDashboardSettings] voiceSettings reloaded for guild=${guild.id}`);
                    } catch (e) {
                        console.warn(`[loadWebDashboardSettings] failed to reload voice settings for guild=${guild.id}:`, e);
                    }
                }

                // 辞書を適用（global-dictionary を優先して取得、空なら従来のエンドポイントへフォールバック）
                console.log(`辞書データを確認中: ${guild.name} (${guild.id})`);
                try {
                    const dictClient = await import('./utils/global-dictionary-client');
                    const merged = await dictClient.fetchAndMergeGlobalDictionary(guild.id, webBaseUrl);
                    if (merged && merged.length) {
                        // 変換して保存（既存の処理を再利用）
                        const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
                        let guildDictionaries: Record<string, any> = {};
                        if (fs.existsSync(dictionariesPath)) {
                            try { guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8')); } catch (e) { console.warn('Failed to parse existing dictionaries:', e); }
                        }
                        const convertedDictionary: Record<string, any> = {};
                        merged.forEach((entry: any) => {
                            if (entry.word && entry.pronunciation) {
                                convertedDictionary[entry.word] = { pronunciation: entry.pronunciation, accent: entry.accent || '', wordType: entry.wordType || '' };
                            }
                        });
                        guildDictionaries[guild.id] = convertedDictionary;
                        fs.writeFileSync(dictionariesPath, JSON.stringify(guildDictionaries, null, 2));
                        console.log(`辞書ファイル更新完了 (merged): ${guild.name} (${guild.id}) - ${merged.length}エントリ`);
                    }
                } catch (e) {
                    console.warn('global-dictionary client error, falling back to legacy dictionary handling:', e);
                }

                console.log(`Web設定読み込み完了: ${guild.name} (${guild.id})`);
            } catch (guildError: any) {
                if (guildError.code === 'ECONNABORTED' || guildError.message.includes('timeout')) {
                    console.warn(`ギルド ${guild.name} (${guild.id}) の設定読み込みをスキップ: timeout of 15000ms exceeded`);
                } else {
                    console.warn(`ギルド ${guild.name} (${guild.id}) の設定読み込みエラー:`, guildError.message);
                }
            }
        }

        // 設定を保存
        const { voiceSettings } = await import('./utils/TTS-Engine');
        const settingsPath = path.resolve(process.cwd(), 'data', 'voice_settings.json');
        fs.writeFileSync(settingsPath, JSON.stringify(voiceSettings, null, 2));

    } catch (error: any) {
        console.warn('Webダッシュボードとの通信失敗:', error.message);
        throw error;
    }
}

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

        // 保存された状態からVoiceを再接続（voiceStateManagerのreconnectToVoiceChannelsを使用）
        try {
            // 関数が client を受け取るかどうかを柔軟に扱う
            const fn: any = reconnectToVoiceChannels;
            if (typeof fn === 'function') {
            if (fn.length > 0) {
                await fn(client);
            } else {
                await fn();
            }
            console.log('reconnectToVoiceChannels による再接続処理が完了しました');
            } else {
            console.warn('reconnectToVoiceChannels が関数ではありません');
            }
        } catch (e) {
            console.warn('reconnectToVoiceChannels 実行中にエラーが発生しました:', e);
        }
        
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
import { voiceClients, setTextChannelForGuildInMap, removeTextChannelForGuildInMap, removeTextChannelByVoiceChannelId } from './utils/TTS-Engine';
import { saveVoiceState, getTextChannelForGuild } from './utils/voiceStateManager';

apiApp.post('/internal/join', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId, textChannelId, requestingChannelId } = req.body || {};
        // Debug: dump incoming payload for runtime troubleshooting
        try { console.log(`[internal/join] received payload: guildId=${guildId} voiceChannelId=${voiceChannelId} textChannelId=${textChannelId} requestingChannelId=${requestingChannelId}`); } catch (e) {}
        if (!guildId || !voiceChannelId) return res.status(400).json({ error: 'guildId and voiceChannelId are required' });
        const guild = client.guilds.cache.get(guildId);
        try { console.log(`[internal/join] guild resolved from cache: ${!!guild} for guildId=${guildId}`); } catch (e) {}
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });
        const voiceChannel = guild.channels.cache.get(voiceChannelId) as any;
        try { console.log(`[internal/join] voiceChannel resolved from cache: ${!!voiceChannel} for voiceChannelId=${voiceChannelId} (type=${voiceChannel?.type})`); } catch (e) {}
        if (!voiceChannel || voiceChannel.type !== 2) return res.status(400).json({ error: 'voice-channel-invalid' });

        // テキストチャンネルの決定ロジックを改善
        // Priority: explicit textChannelId -> requestingChannelId (if valid) -> saved mapping -> autoJoin/join settings
        let finalTextChannelId: string | null = textChannelId || null;

        // Prefer requestingChannelId when explicit textChannelId not provided
        if (!finalTextChannelId && requestingChannelId) {
            try {
                const maybe = guild.channels.cache.get(requestingChannelId) || await guild.channels.fetch(requestingChannelId).catch(() => null);
                if (maybe && maybe.type === 0) {
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

        if (!finalTextChannelId) {
            // 1. 保存されたテキストチャンネルを取得
            // getTextChannelForGuild may return undefined, normalize to null to satisfy the declared type
            finalTextChannelId = getTextChannelForGuild(guildId) || null;
        }

        if (!finalTextChannelId) {
            // 2. 自動参加設定から取得
            const { autoJoinChannels } = await import('./utils/TTS-Engine');
            const autoJoinSetting = autoJoinChannels[guildId];
            if (autoJoinSetting && autoJoinSetting.textChannelId) {
                finalTextChannelId = autoJoinSetting.textChannelId;
            }
        }

        if (!finalTextChannelId) {
            // 3. 参加チャンネル設定から取得
            const { joinChannels } = await import('./utils/TTS-Engine');
            const joinSetting = joinChannels[guildId];
            if (joinSetting && joinSetting.textChannelId) {
                finalTextChannelId = joinSetting.textChannelId;
            }
        }

        // Note: per new policy, do NOT automatically pick guild system/general/first channels.
        // Only use explicit textChannelId provided by the caller, saved textChannel (getTextChannelForGuild),
        // or autoJoin/join settings. If none are available, leave finalTextChannelId null and do not
        // attempt to auto-select another channel.

        // テキストチャンネルが見つかった場合のみ設定
        if (finalTextChannelId) {
            console.log(`[internal/join] ギルド ${guildId}: テキストチャンネル ${finalTextChannelId} を設定中`);
            try {
                // まずキャッシュから確認
                let tc = guild.channels.cache.get(finalTextChannelId) as any;
                // キャッシュにない場合はフェッチを試行
                if (!tc) {
                    tc = await guild.channels.fetch(finalTextChannelId).catch(() => null);
                }
                if (tc && tc.type === 0) {
                    setTextChannelForGuildInMap(guildId, tc);
                    console.log(`[internal/join] 成功: ギルド ${guildId} のテキストチャンネルを設定: ${tc.name} (${finalTextChannelId})`);
                } else {
                    console.warn(`[internal/join] テキストチャンネル設定失敗: ギルド ${guildId} チャンネル ${finalTextChannelId} - 存在: ${!!tc}, タイプ: ${tc?.type}`);
                    // フォールバック: まずはボイスチャンネルのカテゴリ内のテキストチャンネル、次に同名チャンネルを探す
                    try {
                        const voiceChannelObj = guild.channels.cache.get(voiceChannelId) as any;
                        const candidates: any[] = [];
                        if (voiceChannelObj && voiceChannelObj.parentId) {
                            for (const ch of guild.channels.cache.values()) {
                                try {
                                    if (ch.type === 0 && (ch as any).parentId === voiceChannelObj.parentId) candidates.push(ch);
                                } catch (_) { continue; }
                            }
                        }
                        if (candidates.length === 0 && voiceChannelObj) {
                            const sameName = guild.channels.cache.find((c: any) => c.type === 0 && typeof c.name === 'string' && c.name.toLowerCase() === (voiceChannelObj.name || '').toLowerCase());
                            if (sameName) candidates.push(sameName);
                        }
                        if (candidates.length > 0) {
                            const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                            for (const cand of candidates) {
                                try {
                                    const perms = me ? (cand as any).permissionsFor(me) : null;
                                    if (!perms || perms.has('SendMessages')) {
                                        setTextChannelForGuildInMap(guildId, cand);
                                        finalTextChannelId = cand.id;
                                        console.log(`[internal/join] フォールバック成功: ギルド ${guildId} チャンネル ${cand.name} (${cand.id}) を使用`);
                                        break;
                                    }
                                } catch (e) { continue; }
                            }
                        } else {
                            // 従来どおり汎用フォールバックも試す
                            const fallbackChannel = guild.channels.cache.find(ch => 
                                ch.type === 0 && 
                                ch.permissionsFor(guild.members.me!)?.has(['ViewChannel', 'SendMessages'])
                            ) as any;
                            if (fallbackChannel) {
                                setTextChannelForGuildInMap(guildId, fallbackChannel);
                                finalTextChannelId = fallbackChannel.id;
                                console.log(`[internal/join] フォールバック(汎用)成功: ギルド ${guildId} チャンネル ${fallbackChannel.name} (${fallbackChannel.id}) を使用`);
                            }
                        }
                    } catch (e) {
                        console.warn('[internal/join] fallback selection error:', e);
                    }
                }
            } catch (error) {
                console.error(`[internal/join] テキストチャンネル設定エラー: ギルド ${guildId}:`, error);
            }
        } else {
            console.warn(`[internal/join] ギルド ${guildId} の適切なテキストチャンネルが見つかりませんでした`);
        }

        // VoiceConnection は guildId で管理されることが多いため guildId を優先して探し、なければ voiceChannelId を試す
        const prev = (typeof getVoiceConnection === 'function') ? (getVoiceConnection(guildId) || getVoiceConnection(voiceChannelId)) : undefined;
         if (prev) {
             try { prev.destroy(); } catch {}
             try { delete (voiceClients as any)[voiceChannelId]; } catch {}
             try { delete (voiceClients as any)[guildId]; } catch {}
         }
         const connection = joinVoiceChannel({ channelId: voiceChannelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
         // store under both keys for compatibility with TTS-Engine lookup (voiceChannelId and guildId)
         try { (voiceClients as any)[voiceChannelId] = connection; } catch {}
         try { (voiceClients as any)[guildId] = connection; } catch {}
         setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 1000);

        // 即時応答してアナウンスは非同期で実行
        try {
            res.json({
                ok: true,
                textChannelId: finalTextChannelId,
                message: finalTextChannelId ? 'ボイスチャンネルに参加し、テキストチャンネルを設定しました' : 'ボイスチャンネルに参加しましたが、テキストチャンネルが見つかりませんでした'
            });
        } catch (e) {
            console.warn('[internal/join] 応答送信エラー:', e);
        }

        (async () => {
            try {
                const { speakAnnounce } = await import('./utils/TTS-Engine');
                // 明示的に guildId を渡すことで、TTS 側がギルド解決を誤解しないようにする
                try { console.log(`[internal/join] (async) about to call speakAnnounce: guildId=${guildId} voiceChannelId=${voiceChannelId} finalTextChannelId=${finalTextChannelId}`); } catch (e) {}
                await speakAnnounce('接続しました', guildId, client);
                console.log(`[internal/join] (async) 音声アナウンス再生完了: ギルド ${guildId} チャンネル ${voiceChannelId}`);
            } catch (voiceAnnounceError) {
                console.error(`[internal/join] (async) 音声アナウンスエラー: ギルド ${guildId} チャンネル ${voiceChannelId}:`, voiceAnnounceError);
            }
        })();
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

// ボイス設定を取得するAPI
apiApp.get('/internal/voice-settings', async (req: Request, res: Response) => {
    try {
        const { voiceSettings } = await import('./utils/TTS-Engine');
        try {
            // 安全に先頭部分だけをログ出力して確認できるようにする
            const preview = JSON.stringify(voiceSettings).slice(0, 2000);
            console.log('[VOICE_SETTINGS_DUMP] keys=', Object.keys(voiceSettings || {}).length, 'preview=', preview);
        } catch (e) {
            console.warn('[VOICE_SETTINGS_DUMP] failed to stringify voiceSettings:', String(e));
        }
        return res.json({ voiceSettings });
    } catch (e) {
        console.error('voice-settings error:', e);
        return res.status(500).json({ error: 'voice-settings-failed' });
    }
});

// Webダッシュボードの設定を読み込むAPI
apiApp.get('/internal/web-settings/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        // WebダッシュボードのAPIから設定を取得
        const webBaseUrl = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web.aivis-chan-bot-web.svc.cluster.local:3001';
        
        try {
            // サーバー設定を取得
            const settingsResponse = await axios.get(`${webBaseUrl}/api/settings/${guildId}`);
            const personalResponse = await axios.get(`${webBaseUrl}/api/personal-settings/${guildId}`);
            const dictionaryResponse = await axios.get(`${webBaseUrl}/api/dictionary/${guildId}`);

            const result = {
                settings: settingsResponse.data?.settings || null,
                personalSettings: personalResponse.data?.settings || null,
                dictionary: dictionaryResponse.data?.dictionary || []
            };

            return res.json(result);
        } catch (webError: any) {
            console.warn('Failed to fetch web dashboard settings:', webError.message);
            return res.json({ 
                settings: null, 
                personalSettings: null, 
                dictionary: [],
                error: 'web-dashboard-unavailable'
            });
        }
    } catch (e) {
        console.error('web-settings error:', e);
        return res.status(500).json({ error: 'web-settings-failed' });
    }
});

// 設定をBotに適用するAPI
apiApp.post('/internal/apply-web-settings/:guildId', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        const { settings, personalSettings, dictionary } = req.body;

        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        // TTS設定を適用
        if (settings) {
            const { voiceSettings } = await import('./utils/TTS-Engine');
            
            // デフォルト設定を適用（存在確認とフォールバックを厳密化）
            if (!voiceSettings[guildId]) {
                voiceSettings[guildId] = {};
            }

            // 明示的な値だけ上書き（false を許容するため nullish coalescing は使わない）
            if (settings.defaultSpeaker !== undefined && settings.defaultSpeaker !== null) voiceSettings[guildId].defaultSpeaker = settings.defaultSpeaker;
            if (settings.defaultSpeed !== undefined && settings.defaultSpeed !== null) voiceSettings[guildId].defaultSpeed = settings.defaultSpeed;
            if (settings.defaultPitch !== undefined && settings.defaultPitch !== null) voiceSettings[guildId].defaultPitch = settings.defaultPitch;
            if (settings.defaultTempo !== undefined && settings.defaultTempo !== null) voiceSettings[guildId].defaultTempo = settings.defaultTempo;
            if (settings.defaultVolume !== undefined && settings.defaultVolume !== null) voiceSettings[guildId].defaultVolume = settings.defaultVolume;
            if (settings.defaultIntonation !== undefined && settings.defaultIntonation !== null) voiceSettings[guildId].defaultIntonation = settings.defaultIntonation;

            // autoLeave / ignoreBots を明示的に保存できるようにする
            if (typeof settings.autoLeave === 'boolean') voiceSettings[guildId].autoLeave = settings.autoLeave;
            if (typeof settings.ignoreBots === 'boolean') voiceSettings[guildId].ignoreBots = settings.ignoreBots;
            
            // 設定を保存
            const settingsPath = path.resolve(process.cwd(), 'data', 'voice_settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(voiceSettings, null, 2));

            // 即時反映
            try {
                await loadUserVoiceSettings();
                console.log(`[apply-web-settings] voiceSettings reloaded for guild=${guildId}`);
            } catch (e) {
                console.warn(`[apply-web-settings] failed to reload voice settings for guild=${guildId}:`, e);
            }
        }

        // 辞書を適用
        if (dictionary && dictionary.length > 0) {
            const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
            
            let guildDictionaries: Record<string, any> = {};
            if (fs.existsSync(dictionariesPath)) {
                try {
                    guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
                } catch (e) {
                    console.warn('Failed to parse existing dictionaries:', e);
                }
            }

            // 辞書エントリーを適切な形式に変換
            const convertedDictionary = dictionary.map((entry: any) => ({
                word: entry.word,
                pronunciation: entry.pronunciation,
                accent: entry.accent || '',
                wordType: entry.wordType || ''
            }));

            guildDictionaries[guildId] = convertedDictionary;
            fs.writeFileSync(dictionariesPath, JSON.stringify(guildDictionaries, null, 2));
        }

        return res.json({ success: true, message: 'Settings applied successfully' });
    } catch (e) {
        console.error('apply-web-settings error:', e);
        return res.status(500).json({ error: 'apply-settings-failed' });
    }
});

// 即座に設定をリロードするエンドポイント
apiApp.post('/internal/reload-settings', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, settingsType } = req.body;
        
        console.log(`即座に設定リロード要求受信 - Guild: ${guildId}, Type: ${settingsType}`);
        
        if (guildId) {
            // 特定ギルドの設定のみリロード（全設定リロードを実行）
            await loadWebDashboardSettings();
        } else {
            // 全ギルドの設定をリロード
            await loadWebDashboardSettings();
        }
        
        console.log(`設定リロード完了 - Guild: ${guildId || 'ALL'}`);
        return res.json({ success: true, message: 'Settings reloaded successfully' });
    } catch (error) {
        console.error('設定リロードエラー:', error);
        return res.status(500).json({ error: 'Failed to reload settings' });
    }
});

// テキストチャンネル決定API（他のBotが使用）
apiApp.get('/internal/text-channel/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });

        // Accept optional context: requestingChannelId and voiceChannelId
        const requestingChannelId = (req.query.requestingChannelId || req.query.reqCh || '') as string || null;
        const voiceChannelId = (req.query.voiceChannelId || req.query.vc || '') as string || null;

        // ギルドのTier情報を取得
        const { getGuildTier } = await import('./utils/patreonIntegration');
        const guildTier = await getGuildTier(guildId, client);

        // Centralized selection logic
        // Priority: requestingChannelId (if provided and valid) -> saved mapping -> autoJoin -> joinChannels -> preferred by voiceChannelId -> systemChannel -> none
        let finalTextChannelId: string | null = null;
        let reason = 'none';

        // 1) requestingChannelId (highest priority when provided)
        if (requestingChannelId) {
            try {
                const maybe = guild.channels.cache.get(requestingChannelId) || await guild.channels.fetch(requestingChannelId).catch(() => null);
                if (maybe && maybe.type === 0) {
                    const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                    const perms = me ? maybe.permissionsFor(me) : null;
                    if (!perms || perms.has('SendMessages')) {
                        finalTextChannelId = requestingChannelId;
                        reason = 'requestingChannel';
                        console.log(`[text-channel API] using requestingChannelId=${requestingChannelId} for guild=${guildId}`);
                    } else {
                        console.log(`[text-channel API] requestingChannelId present but bot lacks send permission: ${requestingChannelId}`);
                    }
                } else {
                    console.log(`[text-channel API] requestingChannelId invalid or not text: ${requestingChannelId}`);
                }
            } catch (err) {
                console.error(`[text-channel API] error validating requestingChannelId ${requestingChannelId}:`, err);
            }
        }

        // 2) saved mapping
        if (!finalTextChannelId) {
            finalTextChannelId = getTextChannelForGuild(guildId) || null;
            if (finalTextChannelId) reason = 'savedMapping';
        }

        // 3) autoJoin
        if (!finalTextChannelId) {
            const { autoJoinChannels } = await import('./utils/TTS-Engine');
            const autoJoinSetting = autoJoinChannels[guildId];
            if (autoJoinSetting && autoJoinSetting.textChannelId) {
                finalTextChannelId = autoJoinSetting.textChannelId;
                reason = 'autoJoinSetting';
            }
        }

        // 4) joinChannels
        if (!finalTextChannelId) {
            const { joinChannels } = await import('./utils/TTS-Engine');
            const joinSetting = joinChannels[guildId];
            if (joinSetting && joinSetting.textChannelId) {
                finalTextChannelId = joinSetting.textChannelId;
                reason = 'joinChannels';
            }
        }

        // 5) if voiceChannelId provided, attempt category/same-name search here
        if (!finalTextChannelId && voiceChannelId) {
            try {
                const vc = guild.channels.cache.get(voiceChannelId) as any;
                const candidates: any[] = [];
                if (vc && vc.parentId) {
                    for (const ch of guild.channels.cache.values()) {
                        try { if (ch.type === 0 && (ch as any).parentId === vc.parentId) candidates.push(ch); } catch (_) { }
                    }
                }
                if (candidates.length === 0 && vc) {
                    const sameName = guild.channels.cache.find((c: any) => c.type === 0 && typeof c.name === 'string' && c.name.toLowerCase() === (vc.name || '').toLowerCase());
                    if (sameName) candidates.push(sameName);
                }
                if (candidates.length > 0) {
                    const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                    for (const cand of candidates) {
                        try {
                            const perms = me ? (cand as any).permissionsFor(me) : null;
                            if (!perms || perms.has('SendMessages')) {
                                finalTextChannelId = cand.id;
                                reason = 'preferredByVoice';
                                break;
                            }
                        } catch (_) { continue; }
                    }
                }
            } catch (_) {}
        }

        // 6) system channel as last resort (but only if sendable)
        if (!finalTextChannelId) {
            try {
                if (guild.systemChannelId) {
                    const sys = guild.channels.cache.get(guild.systemChannelId) as any;
                    const me = guild.members.me || await guild.members.fetch(client.user!.id).catch(() => null);
                    if (sys && sys.type === 0 && (!me || (sys as any).permissionsFor(me)?.has('SendMessages'))) {
                        finalTextChannelId = guild.systemChannelId;
                        reason = 'systemChannel';
                    }
                }
            } catch (_) {}
        }

        // Validate finalTextChannelId before returning
        if (finalTextChannelId) {
            try {
                const tc = await guild.channels.fetch(finalTextChannelId).catch(() => null);
                if (tc && tc.type === 0) {
                    console.log(`[text-channel API] selected guild=${guildId} text=${finalTextChannelId} reason=${reason}`);
                    return res.json({ ok: true, textChannelId: finalTextChannelId, reason, textChannelName: tc.name, guildTier });
                } else {
                    console.log(`[text-channel API] selected channel invalid after fetch guild=${guildId} id=${finalTextChannelId} type=${tc?.type}`);
                    return res.status(404).json({ error: 'text-channel-invalid-after-fetch', details: { guildId, channelId: finalTextChannelId, reason } });
                }
            } catch (fetchErr) {
                console.error(`[text-channel API] fetch error for ${finalTextChannelId}:`, fetchErr);
                return res.status(500).json({ error: 'channel-fetch-failed', details: { guildId, channelId: finalTextChannelId } });
            }
        }

        console.log(`[text-channel API] no text channel selected for guild=${guildId}`);
        return res.status(404).json({ error: 'no-text-channel-found', reason });
    } catch (e) {
        console.error('text-channel API error:', e);
        return res.status(500).json({ error: 'text-channel-failed' });
    }
});

// joinした順番に退出処理をしてしまう不具合を修正します
apiApp.post('/internal/leave', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId } = req.body || {};
        if (!guildId && !voiceChannelId) return res.status(400).json({ error: 'guildId or voiceChannelId is required' });

        // Try to resolve the connection by guildId first, then by voiceChannelId as a fallback.
        let prev: any = undefined;
        if (guildId) {
            try { prev = getVoiceConnection(guildId); } catch {}
        }
        if (!prev && voiceChannelId) {
            try { prev = getVoiceConnection(voiceChannelId); } catch {}
        }

        if (prev) {
            try { prev.destroy(); } catch (err) { console.warn('Failed to destroy voice connection:', err); }
        }

        // Ensure we remove stored references under BOTH possible keys to avoid stale entries
        try { if (voiceChannelId) delete (voiceClients as any)[voiceChannelId]; } catch {}
        try { if (guildId) delete (voiceClients as any)[guildId]; } catch {}

        // Remove text-channel mapping based on what's available
        try {
            if (voiceChannelId) {
                removeTextChannelByVoiceChannelId(voiceChannelId);
            } else if (guildId) {
                removeTextChannelForGuildInMap(guildId);
            }
        } catch (err) { /* ignore */ }

        // Remove any global player state for either key
        try { if (voiceChannelId) delete (global as any).players?.[voiceChannelId]; } catch {}
        try { if (guildId) delete (global as any).players?.[guildId]; } catch {}

        setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 500);
        return res.json({ ok: true });
    } catch (e) {
        console.error('internal/leave error:', e);
        return res.status(500).json({ error: 'leave-failed' });
    }
});

// 内部: ギルドのチャンネル一覧を返すエンドポイント
// 呼び出しは同一クラスタ内のサービス（web dashboard /主サーバ）向けを想定
apiApp.get('/internal/guilds/:guildId/channels', async (req: Request, res: Response) => {
    try {
        // 簡易認証: 内部シークレットを要求（環境変数 INTERNAL_API_SECRET）
        const secret = process.env.INTERNAL_API_SECRET;
        if (secret) {
            const provided = (req.headers['x-internal-secret'] || '').toString();
            if (!provided || provided !== secret) {
                return res.status(403).json({ error: 'forbidden' });
            }
        }

        const { guildId } = req.params;
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });

        // 最新情報を取得するために fetch を試みる（存在しない場合はキャッシュを使う）
        let channels = [] as any[];
        try {
            const fetched = await guild.channels.fetch();
            channels = Array.from(fetched.values());
        } catch (e) {
            // fetch に失敗したらキャッシュを利用
            channels = Array.from(guild.channels.cache.values());
        }

        // 必要なフィールドのみ返す
        const mapped = channels.map(ch => ({
            id: ch.id,
            name: (ch as any).name || '',
            type: (ch as any).type,
            isText: (ch as any).type === 0,
            isVoice: (ch as any).type === 2,
        }));

        return res.json(mapped);
    } catch (e) {
        console.error('internal/guilds/:guildId/channels error:', e);
        return res.status(500).json({ error: 'channels-failed' });
    }
});

// WEBダッシュボード用: サーバー設定を保存
apiApp.post('/api/settings', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, settings } = req.body;
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        // 設定をファイルに保存
        const settingsDir = path.join(DATA_DIR, 'guild-settings');
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        
        const settingsFile = path.join(settingsDir, `${guildId}.json`);
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

        // TTS設定を即座に反映
        if (settings) {
            const { voiceSettings } = await import('./utils/TTS-Engine');
            
            if (!voiceSettings[guildId]) {
                voiceSettings[guildId] = {};
            }

            // 明示的な値だけ上書き
            const ttsKeys = ['defaultSpeaker','defaultSpeed','defaultPitch','defaultTempo','defaultVolume','defaultIntonation','autoLeave','ignoreBots'];
            for (const k of ttsKeys) {
                if (settings[k] !== undefined && settings[k] !== null) {
                    voiceSettings[guildId][k] = settings[k];
                }
            }
            
            // 設定を保存
            const settingsPath = path.resolve(process.cwd(), 'data', 'voice_settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(voiceSettings, null, 2));

            // 即時反映
            try {
                await loadUserVoiceSettings();
                console.log(`[api/settings] voiceSettings reloaded for guild=${guildId}`);
            } catch (e) {
                console.warn(`[api/settings] failed to reload voice settings for guild=${guildId}:`, e);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Settings save error:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// WEBダッシュボード用: サーバー設定を取得
apiApp.get('/api/settings/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        // 設定ファイルから読み込み
        const settingsFile = path.join(DATA_DIR, 'guild-settings', `${guildId}.json`);
        
        if (!fs.existsSync(settingsFile)) {
            // デフォルト設定を返す
            return res.json({ 
                settings: {
                    defaultSpeaker: null,
                    defaultSpeed: 1.0,
                    defaultPitch: 0,
                    defaultTempo: 1.0,
                    defaultVolume: 1.0,
                    defaultIntonation: 1.0,
                    autoLeave: true,
                    ignoreBots: true
                }
            });
        }

        const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        res.json({ settings });
    } catch (error) {
        console.error('Settings fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// WEBダッシュボード用: 個人設定を保存
apiApp.post('/api/personal-settings', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, userId, settings } = req.body;
        
        if (!guildId || !userId) {
            return res.status(400).json({ error: 'guildId and userId are required' });
        }

        // 個人設定をファイルに保存
        const personalDir = path.join(DATA_DIR, 'personal-settings');
        if (!fs.existsSync(personalDir)) {
            fs.mkdirSync(personalDir, { recursive: true });
        }
        
        const personalFile = path.join(personalDir, `${guildId}_${userId}.json`);
        fs.writeFileSync(personalFile, JSON.stringify(settings, null, 2));

        // TTS設定を即座に反映
        if (settings) {
            const { voiceSettings } = await import('./utils/TTS-Engine');
            
            if (!voiceSettings[userId]) {
                voiceSettings[userId] = {};
            }

            // ユーザー固有の設定を保存
            const userKeys = ['speaker','speed','pitch','tempo','volume','intonation'];
            for (const k of userKeys) {
                if (settings[k] !== undefined && settings[k] !== null) {
                    voiceSettings[userId][k] = settings[k];
                }
            }
            
            // 設定を保存
            const settingsPath = path.resolve(process.cwd(), 'data', 'voice_settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(voiceSettings, null, 2));

            // 即時反映
            try {
                await loadUserVoiceSettings();
                console.log(`[api/personal-settings] voiceSettings reloaded for user=${userId} in guild=${guildId}`);
            } catch (e) {
                console.warn(`[api/personal-settings] failed to reload voice settings:`, e);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Personal settings save error:', error);
        res.status(500).json({ error: 'Failed to save personal settings' });
    }
});

// WEBダッシュボード用: 個人設定を取得
apiApp.get('/api/personal-settings/:guildId/:userId', async (req: Request, res: Response) => {
    try {
        const { guildId, userId } = req.params;
        
        if (!guildId || !userId) {
            return res.status(400).json({ error: 'guildId and userId are required' });
        }

        // 個人設定ファイルから読み込み
        const personalFile = path.join(DATA_DIR, 'personal-settings', `${guildId}_${userId}.json`);
        
        if (!fs.existsSync(personalFile)) {
            // デフォルト設定を返す
            return res.json({ 
                settings: {
                    speaker: null,
                    speed: 1.0,
                    pitch: 0,
                    tempo: 1.0,
                    volume: 1.0,
                    intonation: 1.0
                }
            });
        }

        const settings = JSON.parse(fs.readFileSync(personalFile, 'utf8'));
        res.json({ settings });
    } catch (error) {
        console.error('Personal settings fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch personal settings' });
    }
});

// WEBダッシュボード用: 辞書を保存
apiApp.post('/api/dictionary', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, dictionary } = req.body;
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        // 辞書を適用
        if (dictionary && Array.isArray(dictionary)) {
            const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
            
            let guildDictionaries: Record<string, any> = {};
            if (fs.existsSync(dictionariesPath)) {
                try {
                    guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
                } catch (e) {
                    console.warn('Failed to parse existing dictionaries:', e);
                }
            }

            // 辞書エントリーを適切な形式に変換
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
            
            console.log(`[api/dictionary] Dictionary updated for guild=${guildId}, entries=${dictionary.length}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Dictionary save error:', error);
        res.status(500).json({ error: 'Failed to save dictionary' });
    }
});

// WEBダッシュボード用: 辞書を取得
apiApp.get('/api/dictionary/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
        
        if (!fs.existsSync(dictionariesPath)) {
            return res.json({ dictionary: [] });
        }

        const guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
        const dictionary = guildDictionaries[guildId] || {};
        
        // オブジェクトを配列形式に変換
        const dictionaryArray = Object.entries(dictionary).map(([word, data]: [string, any]) => ({
            word,
            pronunciation: data.pronunciation || '',
            accent: data.accent || '',
            wordType: data.wordType || ''
        }));

        res.json({ dictionary: dictionaryArray });
    } catch (error) {
        console.error('Dictionary fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch dictionary' });
    }
});

// WEBダッシュボード用: 話者一覧を取得
apiApp.get('/api/speakers', async (req: Request, res: Response) => {
    try {
        const speakersPath = path.resolve(process.cwd(), 'data', 'speakers.json');
        
        if (!fs.existsSync(speakersPath)) {
            return res.json([]);
        }

        const speakersData = JSON.parse(fs.readFileSync(speakersPath, 'utf8'));
        const speakers = Array.isArray(speakersData) ? speakersData : (speakersData.speakers || []);
        
        res.json(speakers);
    } catch (error) {
        console.error('Speakers fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch speakers' });
    }
});

// ギルドのチャンネル一覧を取得
apiApp.get('/api/guilds/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        // チャンネル一覧を取得（タイプ情報を含む）
        const channels = Array.from(guild.channels.cache.values())
            .filter(channel => {
                // テキストチャンネル、ボイスチャンネル、ステージチャンネルのみ
                return channel.type === 0 || // GUILD_TEXT
                       channel.type === 2 || // GUILD_VOICE
                       channel.type === 5 || // GUILD_NEWS
                       channel.type === 13 || // GUILD_STAGE_VOICE
                       channel.type === 15; // GUILD_FORUM
            })
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position || 0
            }))
            .sort((a, b) => a.position - b.position);

        console.log(`[API] Returning ${channels.length} channels for guild ${guildId}`);
        res.json(channels);
    } catch (e) {
        console.error('Failed to get guild channels:', e);
        res.status(500).json({ error: 'Failed to get channels' });
    }
});

// WEBダッシュボード用: 現在のボイス接続状態を取得
apiApp.get('/api/voice-status/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        const connection = voiceClients[guildId];
        
        if (!connection) {
            return res.json({ 
                connected: false,
                voiceChannelId: null,
                textChannelId: null
            });
        }

        const textChannelId = getTextChannelForGuild(guildId);
        
        res.json({
            connected: connection.state.status === VoiceConnectionStatus.Ready,
            voiceChannelId: connection.joinConfig.channelId,
            textChannelId: textChannelId || null,
            status: connection.state.status
        });
    } catch (error) {
        console.error('Voice status fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch voice status' });
    }
});

// Helper: Bot設定変更を他のBotインスタンスに通知
async function notifyBotsSettingsUpdate(guildId: string, settings: any) {
    const botUrls = [
        process.env.BOT_1ST_URL || 'http://aivis-chan-bot-1st:3002',
        process.env.BOT_2ND_URL || 'http://aivis-chan-bot-2nd:3003',
        process.env.BOT_3RD_URL || 'http://aivis-chan-bot-3rd:3004',
        process.env.BOT_4TH_URL || 'http://aivis-chan-bot-4th:3005',
        process.env.BOT_5TH_URL || 'http://aivis-chan-bot-5th:3006',
        process.env.BOT_6TH_URL || 'http://aivis-chan-bot-6th:3007'
    ];

    const notifyPromises = botUrls.map(async (url) => {
        try {
            const response = await axios.post(`${url}/internal/apply-web-settings/${guildId}`, 
                { settings },
                { 
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );
            if (!response || response.status !== 200) {
                console.warn(`Failed to notify bot at ${url}: ${response?.status || 'no response'}`);
            }
        } catch (error: any) {
            console.warn(`Error notifying bot at ${url}:`, error.message);
        }
    });

    await Promise.allSettled(notifyPromises);
}

// WEBダッシュボード用: ユーザーが参加しているサーバー一覧を取得
apiApp.get('/api/servers', async (req: Request, res: Response) => {
    try {
        // 認証チェック（セッションベースの認証が必要な場合）
        // この実装では、全てのBotが参加しているサーバー一覧を返します
        
        // Botが参加している全サーバーを取得
        const guilds = Array.from(client.guilds.cache.values()).map(guild => {
            // アイコンURLを生成
            const iconUrl = guild.icon 
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
                : null;
            
            // ボイス接続状態を確認
            const connection = voiceClients[guild.id];
            const isConnected = connection && connection.state.status === VoiceConnectionStatus.Ready;
            
            return {
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                iconUrl: iconUrl,
                memberCount: guild.memberCount,
                voiceConnected: isConnected,
                owner: false, // オーナー情報は認証後に取得可能
                permissions: null // 権限情報は認証後に取得可能
            };
        });

        // サーバー名でソート
        guilds.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        console.log(`[API] /api/servers: ${guilds.length} servers returned`);
        res.json(guilds);
    } catch (error) {
        console.error('Failed to fetch servers:', error);
        res.status(500).json({ error: 'Failed to retrieve server list' });
    }
});

// 設定変更通知を受け取るエンドポイント
apiApp.post('/api/settings/notify', async (req: Request, res: Response) => {
    try {
        const { guildId, userId, settings } = req.body;
        
        console.log(`[API] Settings update notification for guild: ${guildId}`);
        
        // ここでBotの内部キャッシュを更新するなどの処理を行う
        // 例: settingsCache.set(guildId, settings);
        
        res.json({ 
            success: true, 
            message: 'Settings notification received',
            guildId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Failed to process settings notification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process notification' 
        });
    }
});

// 個人設定変更通知を受け取るエンドポイント
apiApp.post('/api/personal-settings/notify', async (req: Request, res: Response) => {
    try {
        const { guildId, userId, settings } = req.body;
        
        console.log(`[API] Personal settings update notification for guild: ${guildId}, user: ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'Personal settings notification received',
            guildId,
            userId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Failed to process personal settings notification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process notification' 
        });
    }
});

// 辞書変更通知を受け取るエンドポイント
apiApp.post('/api/dictionary/notify', async (req: Request, res: Response) => {
    try {
        const { guildId, dictionary } = req.body;
        
        console.log(`[API] Dictionary update notification for guild: ${guildId}`);
        
        res.json({ 
            success: true, 
            message: 'Dictionary notification received',
            guildId,
            entryCount: Array.isArray(dictionary) ? dictionary.length : 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Failed to process dictionary notification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process notification' 
        });
    }
});