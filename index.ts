import { Client, GatewayIntentBits, ActivityType, MessageFlags, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { deployCommands } from "./utils/deploy-commands";
import { REST } from "@discordjs/rest";
import * as fs from "fs";
import * as path from "path";
import { AivisAdapter } from "./utils/TTS-Engine";
import { ServerStatus, fetchUUIDsPeriodically } from "./utils/dictionaries";
import { MessageCreate } from "./utils/MessageCreate";
import { setupVoiceStateUpdateHandlers } from "./utils/VoiceStateUpdate";
import { logError } from "./utils/errorLogger";
import './utils/patreonIntegration'; // Patreon連携モジュールをインポート
import { ConversationTrackingService } from "./utils/conversation-tracking-service"; // 会話分析サービス
import { VoiceStampManager, setupVoiceStampEvents } from "./utils/voiceStamp"; // ボイススタンプ機能をインポート
import { initSentry } from './utils/sentry';
import { VoiceConnection, VoiceConnectionStatus, entersState } from "@discordjs/voice";
import express from 'express';
import axios from 'axios';
const FOLLOW_PRIMARY = process.env.FOLLOW_PRIMARY === 'true';
const PRIMARY_URL = process.env.PRIMARY_URL || 'http://aivis-chan-bot-1st:3002';
const ALLOW_COMMANDS = process.env.ALLOW_COMMANDS === 'true';

async function syncSettingsFromPrimary() {
    if (!FOLLOW_PRIMARY) return;
    try {
        const url = `${PRIMARY_URL.replace(/\/$/, '')}/internal/settings/bundle`;
        const { data } = await axios.get(url, { timeout: 7000 });
        const d: any = data as any;
        if (d && d.files && typeof d.files === 'object') {
            const dataDir = path.resolve(process.cwd(), 'data');
            fs.mkdirSync(dataDir, { recursive: true });
            for (const [name, content] of Object.entries<any>(d.files)) {
                try {
                    fs.writeFileSync(path.join(dataDir, name), JSON.stringify(content, null, 2), 'utf8');
                } catch (e) {
                    console.warn(`設定書き込みに失敗: ${name}`, e);
                }
            }
            console.log('Primary設定を同期しました');
        }

        // ボイス設定も同期
        try {
            const voiceSettingsUrl = `${PRIMARY_URL.replace(/\/$/, '')}/internal/voice-settings`;
            const { data: voiceData } = await axios.get(voiceSettingsUrl, { timeout: 7000 });
            const vd: any = voiceData as any;
            if (vd && vd.voiceSettings) {
                const { voiceSettings } = await import('./utils/TTS-Engine');
                Object.assign(voiceSettings, vd.voiceSettings);
                console.log('Primaryボイス設定を同期しました');
            }
        } catch (e) {
            console.warn('Primaryボイス設定の同期に失敗:', e);
        }
    } catch (e) {
        console.warn('Primary設定の同期に失敗:', e);
    }
}

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
        if (FOLLOW_PRIMARY) {
            console.log('[Follower Mode] プライマリ設定を同期して起動します');
            client.user!.setActivity('Linked to Primary', { type: ActivityType.Playing });
            await syncSettingsFromPrimary();
        }

        // --- 各ギルドのVoiceConnectionがReadyになるまで待機 ---
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

        AivisAdapter();
        console.log("AivisAdapter初期化完了");

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

        // コマンドは1台目のみ: デプロイとハンドリングを制御
        if (ALLOW_COMMANDS) {
            await deployCommands(client);
            console.log("コマンドのデプロイ完了(許可有り)");
        } else {
            console.log("コマンド機能は無効化(ALLOW_COMMANDS=false)");
        }

        // 再接続が完了した後で他の機能を初期化
        MessageCreate(client);
        setupVoiceStateUpdateHandlers(client);
        console.log("起動完了");
        client.user!.setActivity("起動完了", { type: ActivityType.Playing });
        
        // 辞書データ関連の処理を後で行う（global-dictionary を優先して取得、空なら従来のエンドポイントへフォールバック）
        try {
            const webBaseUrl = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web.aivis-chan-bot-web.svc.cluster.local';
            const { fetchAndMergeGlobalDictionary } = await import('./utils/global-dictionary-client');
            const { fetchUUIDsPeriodically } = await import('./utils/dictionaries');
            fetchUUIDsPeriodically();
            // loadWebDashboardSettings will already have applied legacy dictionary handling for now; additional logic could be added here if needed.
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
            { name: '1st', baseUrl: 'http://aivis-chan-bot-1st:3002' },
            { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd:3003' },
            { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd:3004' },
            { name: '4th', baseUrl: 'http://aivis-chan-bot-4th:3005' },
            { name: '5th', baseUrl: 'http://aivis-chan-bot-5th:3006' },
            { name: '6th', baseUrl: 'http://aivis-chan-bot-6th:3007' }
        ];

        async function getClusterVCCount(selfCount: number, timeoutMs = 2000): Promise<number> {
            try {
                const results: number[] = await Promise.all(BOTS.map(async b => {
                    try {
                        const { data } = await axios.get<{ vcCount?: number }>(`${b.baseUrl}/internal/info`, { timeout: timeoutMs });
                        return (typeof data?.vcCount === 'number') ? (data.vcCount as number) : 0;
                    } catch {
                        return 0;
                    }
                }));
                const sum = results.reduce((a: number, c: number) => a + c, 0);
                return Math.max(sum, selfCount);
            } catch {
                return selfCount;
            }
        }

        setInterval(async () => {
            try {
                const joinServerCount = client.guilds.cache.size;
                const selfVC = client.voice.adapters.size;
                const totalVC = await getClusterVCCount(selfVC);
                const label = FOLLOW_PRIMARY ? 'Linked' : '/help';
                client.user!.setActivity(`${label} | VC: ${selfVC}/${totalVC} | Srv: ${joinServerCount} | ${client.ws.ping}ms`, { type: ActivityType.Custom });
            } catch (error) {
                console.error("ステータス更新エラー:", error);
                logError('statusUpdateError', error instanceof Error ? error : new Error(String(error)));
            }
        }, 30000);
    } catch (error) {
        console.error("Bot起動エラー:", error);
        logError('botStartupError', error instanceof Error ? error : new Error(String(error)));
    }
});

client.on("interactionCreate", async interaction => {
    try {
        // スラッシュコマンド処理
        if (interaction.isChatInputCommand()) {
            if (!ALLOW_COMMANDS) {
                // コマンド無効。静かに無視するか、エフェメラル通知（必要なら有効化）
                return;
            }
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            
            // Pro/Premiumギルドチェック（プライマリBotからTier情報を取得）
            try {
                const guildId = interaction.guildId;
                if (guildId) {
                    const primaryResponse = await axios.get(`${PRIMARY_URL.replace(/\/$/, '')}/internal/text-channel/${guildId}`, { timeout: 3000 });
                    const data = primaryResponse.data as { guildTier?: string };
                    
                    // Pro/Premiumギルドの場合のみコマンド実行を許可
                    if (data.guildTier !== 'pro' && data.guildTier !== 'premium') {
                        await interaction.reply({
                            content: 'このBotはPro/Premiumギルドでのみ使用可能です。サーバー所有者がPatreonでProまたはPremiumプランに加入してください。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }
                }
            } catch (tierError) {
                console.warn('[2nd Bot] Tierチェックに失敗:', tierError);
                // Tierチェックに失敗した場合はコマンド実行を許可しない
                await interaction.reply({
                    content: 'ギルド情報の確認中にエラーが発生しました。しばらくしてからお試しください。',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
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
            .setTitle('Aivis Chan Botが導入されました！')
            .setDescription('Aivis Chan Botを導入いただきありがとうございます。Discordサーバーにてメッセージ読み上げ等を行う便利BOTです。')
            .addFields(
                { name: 'BOTの概要', value: '音声合成を活用した読み上げBotです。多彩な話者やエフェクトを使えます。' },
                { name: '主要特徴', value: '• カスタマイズ可能な読み上げ\n• 豊富な音声エフェクト\n• カスタム辞書の登録' },
                { name: '基本コマンド', value: '• /help\n• /join\n• /leave' },
                { name: '🌟 プレミアムプラン', value: '• Pro版: 読み上げキューの優先度が上昇\n全てのコマンド・機能\n優先サポート（Discord）\n音声設定カスタマイズ\n• Premium版: 読み上げキューの優先度がさらに上昇\n無制限利用・全ての機能\n優先サポート（Discord・メール）\nカスタム話者追加\nAPIアクセス（外部連携）\n特別リクエスト・開発協力\n• 詳細は `/subscription info` で確認' },
                { name: '💰 Patreon連携', value: 'PatreonでBot開発をサポートすると、Pro版やPremium版の特典が自動で適用されます！\n• `/patreon link` コマンドでPatreonアカウントを連携\n• 支援Tierに応じて特典が自動有効化' }
            )
            .setFooter({ text: 'Powered by AivisSpeech' })
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
                    .setLabel('購読プラン')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Subscription'),
                new ButtonBuilder()
                    .setLabel('Patreonで支援する')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://www.patreon.com/AlecJP02'),
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
apiApp.get('/api/stats', async (req: Request, res: Response) => {
    try {
        const serverCount = client.guilds.cache.size;
        const vcCount = client.voice.adapters.size;
        // 全サーバーのメンバー数合計
        const userCount = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount ?? 0), 0);

        // シャード情報が null の可能性があるため安全に扱う
        let shardCount = 1;
        let totalShards = 1;

        if (client.shard) {
            shardCount = client.shard.count ?? 1;
            try {
                const results = await client.shard.broadcastEval(() => 1);
                if (Array.isArray(results) && results.length > 0) {
                    totalShards = results.reduce((acc, val) => acc + (typeof val === 'number' ? val : Number(val)), 0);
                } else {
                    totalShards = shardCount;
                }
            } catch (e) {
                console.warn('シャード集計に失敗しました、デフォルト値を使用します:', e);
                totalShards = shardCount;
            }
        }

        res.json({ serverCount, userCount, shardCount, totalShards, vcCount });
    } catch (err) {
        console.error('Stats API エラー:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
apiApp.listen(3007, () => {
    console.log('Stats APIサーバーがポート3007で起動しました');
});
// --- ここまで追加 ---

// --- 内部: 指定ギルド/チャンネルへ参加API & info ---
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { textChannels, voiceClients } from './utils/TTS-Engine';

apiApp.post('/internal/join', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId, textChannelId } = req.body || {};
        if (!guildId || !voiceChannelId) return res.status(400).json({ error: 'guildId and voiceChannelId are required' });
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });
        const voiceChannel = guild.channels.cache.get(voiceChannelId);
        if (!voiceChannel || !('type' in voiceChannel) || (voiceChannel as any).type !== 2) return res.status(400).json({ error: 'voice-channel-invalid' });
        const existing = voiceClients[guildId];
        if (existing && existing.state.status === VoiceConnectionStatus.Ready && existing.joinConfig.channelId !== voiceChannelId) {
            return res.status(409).json({ error: 'already-connected-other-channel', current: existing.joinConfig.channelId });
        }

    let finalTextChannelId = textChannelId;

    if (!finalTextChannelId) {
            // 3. ギルドのシステムチャンネルを使用
            if (guild.systemChannel && guild.systemChannel.type === 0) {
                finalTextChannelId = guild.systemChannel.id;
            }
        }

        if (!finalTextChannelId) {
            // 4. 一般チャンネルを探す
            const generalChannel = guild.channels.cache.find(ch =>
                ch.type === 0 && (ch.name.includes('general') || ch.name.includes('一般'))
            );
            if (generalChannel) {
                finalTextChannelId = generalChannel.id;
            }
        }

        if (!finalTextChannelId) {
            // 5. 最初のテキストチャンネルを使用
            const firstTextChannel = guild.channels.cache.find(ch => ch.type === 0);
            if (firstTextChannel) {
                finalTextChannelId = firstTextChannel.id;
            }
        }

        // テキストチャンネルが見つかった場合のみ設定
        if (finalTextChannelId) {
            console.log(`[internal/join:4th] ギルド ${guildId}: テキストチャンネル ${finalTextChannelId} を設定中`);
            
            try {
                // まずキャッシュから確認
                let tc = guild.channels.cache.get(finalTextChannelId) as any;
                
                // キャッシュにない場合はフェッチを試行
                if (!tc) {
                    tc = await guild.channels.fetch(finalTextChannelId).catch(() => null);
                }
                
                if (tc && tc.type === 0) {
                    (textChannels as any)[voiceChannelId] = tc;
                    console.log(`[internal/join:6th] 成功: ギルド ${guildId} のテキストチャンネルを設定: ${tc.name} (${finalTextChannelId})`);
                } else {
                    console.warn(`[internal/join:6th] テキストチャンネル設定失敗: ギルド ${guildId} チャンネル ${finalTextChannelId} - 存在: ${!!tc}, タイプ: ${tc?.type}`);
                    
                    // フォールバック: 利用可能なテキストチャンネルを探す
                    const fallbackChannel = guild.channels.cache.find(ch => 
                        ch.type === 0 && 
                        ch.permissionsFor(guild.members.me!)?.has(['ViewChannel', 'SendMessages'])
                    ) as any;
                    
                    if (fallbackChannel) {
                        (textChannels as any)[guildId] = fallbackChannel;
                        finalTextChannelId = fallbackChannel.id;
                        console.log(`[internal/join:6th] フォールバック成功: ギルド ${guildId} チャンネル ${fallbackChannel.name} (${fallbackChannel.id}) を使用`);
                    }
                }
            } catch (error) {
                console.error(`[internal/join:6th] テキストチャンネル設定エラー: ギルド ${guildId}:`, error);
            }
        } else {
            console.warn(`[internal/join:6th] ギルド ${guildId} の適切なテキストチャンネルが見つかりませんでした`);
        }

    const prev = getVoiceConnection(voiceChannelId);
    if (prev) { try { prev.destroy(); } catch {} delete voiceClients[voiceChannelId]; }
    const connection = joinVoiceChannel({ channelId: voiceChannelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
    voiceClients[voiceChannelId] = connection;
        // wait for the connection to become Ready or Disconnected, but don't hang forever
        const waitReady = (conn: VoiceConnection, timeoutMs = 10000) => {
            return new Promise<void>((resolve) => {
                let finished = false;
                const cleanup = () => {
                    try { conn.off(VoiceConnectionStatus.Ready, onReady); } catch {}
                    try { conn.off(VoiceConnectionStatus.Disconnected, onDisc); } catch {}
                };
                const onReady = () => { if (finished) return; finished = true; cleanup(); resolve(); };
                const onDisc = () => { if (finished) return; finished = true; cleanup(); resolve(); };
                conn.once(VoiceConnectionStatus.Ready, onReady);
                conn.once(VoiceConnectionStatus.Disconnected, onDisc);
                // fallback timeout to ensure resolution even if events never fire
                setTimeout(() => { if (finished) return; finished = true; cleanup(); resolve(); }, timeoutMs);
            });
        };
        await waitReady(connection, 10000);
        // 6th Botではボイス状態の保存をスキップ（1st Botが管理）
        // try { saveVoiceState(client as any); } catch {}
        
        // Voice接続安定化のための短い遅延
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 音声アナウンスを再生
        try {
            console.log(`[internal/join:6th] 音声アナウンス開始: ギルド ${guildId}`);
            const { speakAnnounce } = await import('./utils/TTS-Engine');
            console.log(`[internal/join:6th] speakAnnounce関数インポート完了: ギルド ${guildId}`);
            await speakAnnounce('接続しました', voiceChannelId, client);
            console.log(`[internal/join:6th] 音声アナウンス再生完了: ギルド ${guildId}`);
        } catch (voiceAnnounceError) {
            console.error(`[internal/join:6th] 音声アナウンスエラー: ギルド ${guildId}:`, voiceAnnounceError);
            if (voiceAnnounceError instanceof Error) {
                console.error(`[internal/join:6th] エラースタック:`, voiceAnnounceError.stack);
            }
        }
        
        return res.json({
            ok: true,
            textChannelId: finalTextChannelId,
            message: finalTextChannelId ? 'ボイスチャンネルに参加し、テキストチャンネルを設定しました' : 'ボイスチャンネルに参加しましたが、テキストチャンネルが見つかりませんでした'
        });
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

apiApp.post('/internal/leave', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId } = req.body || {};
        if (!guildId && !voiceChannelId) return res.status(400).json({ error: 'guildId or voiceChannelId is required' });

        // respond immediately
        try { res.json({ ok: true }); } catch (e) { console.warn('[internal/leave:6th] response send failed:', e); }

        (async () => {
            try {
                if (voiceChannelId) {
                    try { cleanupAudioResources(voiceChannelId); } catch (e) { console.warn('cleanupAudioResources by voiceChannelId failed', e); }
                    try { delete (voiceClients as any)[voiceChannelId]; } catch {}
                    try { delete (textChannels as any)[voiceChannelId]; } catch {}
                    try { delete (global as any).players?.[voiceChannelId]; } catch {}
                } else if (guildId) {
                    try { cleanupAudioResources(guildId); } catch (e) { console.warn('cleanupAudioResources by guildId failed', e); }
                    try { delete (voiceClients as any)[guildId]; } catch {}
                    try { delete (textChannels as any)[guildId]; } catch {}
                    try { delete (global as any).players?.[guildId]; } catch {}
                }
            } catch (err) {
                console.warn('[internal/leave:6th] async cleanup error:', err);
            }
        })();
        return;
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
                
                // 辞書設定を読み込み（タイムアウト時間を15秒に延長）
                const dictionaryResponse = await axios.get(`${webDashboardUrl}/internal/dictionary/${guildId}`, {
                    timeout: 15000
                });
                
                console.log(`辞書データを確認中: ${guild.name} (${guildId})`);
                if (dictionaryResponse.data && dictionaryResponse.data.dictionary) {
                    console.log(`辞書エントリ数: ${dictionaryResponse.data.dictionary.length}`);
                    console.log(`ギルド ${guild.name} (${guildId}) の辞書を読み込みました:`, dictionaryResponse.data.dictionary.length, '件');
                    // ここで辞書を適用する処理を追加
                    // Apply dictionary entries: save to disk and try to update in-memory runtime if possible
                    try {
                        const dict = dictionaryResponse.data.dictionary;
                        const dictDir = path.join(DATA_DIR, 'guild-dictionaries');
                        if (!fs.existsSync(dictDir)) fs.mkdirSync(dictDir, { recursive: true });
                        const dictFile = path.join(dictDir, `${guildId}.json`);
                        fs.writeFileSync(dictFile, JSON.stringify(dict, null, 2), 'utf8');
                        console.log(`ギルド ${guild.name} (${guildId}) の辞書を保存しました: ${dictFile}`);

                        // ランタイムの辞書モジュールに反映できるなら反映する（柔軟に対応）
                        try {
                            const dictModule = await import('./utils/dictionaries');
                            const dm: any = dictModule;

                            if (typeof dm.applyGuildDictionary === 'function') {
                                dm.applyGuildDictionary(guildId, dict);
                                console.log(`ギルド ${guildId} の辞書をメモリに適用しました (applyGuildDictionary)`);
                            } else if (typeof dm.setGuildDictionary === 'function') {
                                dm.setGuildDictionary(guildId, dict);
                                console.log(`ギルド ${guildId} の辞書をメモリに適用しました (setGuildDictionary)`);
                            } else if (typeof dm.registerGuildDictionary === 'function') {
                                dm.registerGuildDictionary(guildId, dict);
                                console.log(`ギルド ${guildId} の辞書をメモリに適用しました (registerGuildDictionary)`);
                            } else if (dm.guildDictionaries && typeof dm.guildDictionaries === 'object') {
                                (dm.guildDictionaries as Record<string, any>)[guildId] = dict;
                                console.log(`ギルド ${guildId} の辞書を guildDictionaries に格納しました`);
                            } else if (dm.guildDictionary && typeof dm.guildDictionary === 'object') {
                                // 一部モジュールでは単数形でエクスポートしている可能性があるため対応
                                (dm.guildDictionary as Record<string, any>)[guildId] = dict;
                                console.log(`ギルド ${guildId} の辞書を guildDictionary に格納しました`);
                            } else {
                                // グローバルキャッシュにも入れておく（他モジュールが参照する可能性に備える）
                                (global as any).guildDictionaries = (global as any).guildDictionaries || {};
                                (global as any).guildDictionaries[guildId] = dict;
                                console.log(`ギルド ${guildId} の辞書を global.guildDictionaries に保存しました`);
                            }
                        } catch (e) {
                            console.warn(`辞書のランタイム適用に失敗しました: ${guildId}`, e);
                        }
                    } catch (e) {
                        console.error(`ギルド ${guildId} の辞書保存に失敗しました:`, e);
                    }
                } else {
                    console.warn(`辞書データが取得できませんでした: ${guild.name} (${guildId})`);
                }
                
            } catch (guildError: any) {
                if (guildError.code === 'ECONNABORTED' || guildError.message.includes('timeout')) {
                    console.log(`ギルド ${guild.name} (${guildId}) の設定読み込みをスキップ: timeout of 15000ms exceeded`);
                } else {
                    console.log(`ギルド ${guild.name} (${guildId}) の設定読み込みをスキップ: ${guildError?.message || guildError}`);
                }
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
function cleanupAudioResources(target: any) {
    try {
        // 1) Voice connections
        try {
            // direct key match
            if ((voiceClients as any)[target]) {
                try { (voiceClients as any)[target].destroy?.(); } catch (e) { /* ignore */ }
                delete (voiceClients as any)[target];
            }

            // find by joinConfig.channelId or joinConfig.guildId
            for (const [key, conn] of Object.entries(voiceClients as Record<string, any>)) {
                try {
                    if (!conn) { delete (voiceClients as any)[key]; continue; }
                    const jc = conn.joinConfig || {};
                    if (jc.channelId === target || jc.guildId === target || key === target) {
                        try { conn.destroy?.(); } catch (e) { /* ignore */ }
                        delete (voiceClients as any)[key];
                    }
                } catch (e) { /* ignore per-entry errors */ }
            }
        } catch (e) {
            console.warn('cleanupAudioResources: voiceClients cleanup error', e);
        }

        // 2) Audio players kept on global.players
        try {
            const players = (global as any).players || {};
            // direct key
            if (players[target]) {
                try {
                    const p = players[target];
                    if (typeof p.stop === 'function') p.stop(true);
                    else if (typeof p.destroy === 'function') p.destroy();
                } catch (e) { /* ignore */ }
                delete (global as any).players[target];
            }
            // scan for players referencing this guild/channel
            for (const key of Object.keys(players)) {
                try {
                    const p = players[key];
                    if (!p) { delete (global as any).players[key]; continue; }
                    if (p.voiceChannelId === target || p.guildId === target || key === target) {
                        try {
                            if (typeof p.stop === 'function') p.stop(true);
                            else if (typeof p.destroy === 'function') p.destroy();
                        } catch (e) { /* ignore */ }
                        delete (global as any).players[key];
                    }
                } catch (e) { /* ignore */ }
            }
        } catch (e) {
            console.warn('cleanupAudioResources: players cleanup error', e);
        }

        // 3) textChannels mapping cleanup
        try {
            const tc = textChannels as Record<string, any>;
            for (const key of Object.keys(tc)) {
                try {
                    const ch = tc[key];
                    if (!ch) {
                        delete tc[key];
                        continue;
                    }
                    if (key === target || ch.id === target || ch.guild?.id === target) {
                        delete tc[key];
                    }
                } catch (e) { /* ignore per-entry errors */ }
            }
        } catch (e) {
            console.warn('cleanupAudioResources: textChannels cleanup error', e);
        }

        // 4) (Optional) remove any other temp resources keyed by target in data dir
        try {
            const tmpDir = path.join(DATA_DIR, 'temp-audio');
            if (fs.existsSync(tmpDir)) {
                for (const file of fs.readdirSync(tmpDir)) {
                    try {
                        if (file.includes(target)) {
                            fs.unlinkSync(path.join(tmpDir, file));
                        }
                    } catch (e) { /* ignore file-level errors */ }
                }
            }
        } catch (e) {
            // not critical
        }

        console.log(`cleanupAudioResources: cleaned resources for ${String(target)}`);
    } catch (err) {
        console.warn('cleanupAudioResources: unexpected error', err);
    }
}

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