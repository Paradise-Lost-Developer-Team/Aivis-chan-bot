import { Client, GatewayIntentBits, ActivityType, MessageFlags, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
// deployCommands intentionally disabled for follower bots (commands are removed)
import { REST } from "@discordjs/rest";
import * as fs from "fs";
import * as path from "path";
import { AivisAdapter, loadUserVoiceSettings, removeTextChannelByVoiceChannelId, removeTextChannelForGuildInMap, setTextChannelForGuildInMap, getTextChannelForGuild, voiceClients, fetchAndSaveSpeakers } from "./utils/TTS-Engine";
import { ServerStatus, fetchUUIDsPeriodically } from "./utils/dictionaries";
import { MessageCreate } from "./utils/MessageCreate";
import { setupVoiceStateUpdateHandlers } from "./utils/VoiceStateUpdate";
import { logError } from "./utils/errorLogger";
import './utils/patreonIntegration'; // Patreon連携モジュールをインポート
import { ConversationTrackingService } from "./utils/conversation-tracking-service"; // 会話分析サービス
import { VoiceStampManager, setupVoiceStampEvents } from "./utils/voiceStamp"; // ボイススタンプ機能をインポート
import { initSentry } from './utils/sentry';
import { VoiceConnection, VoiceConnectionStatus, entersState, getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import express from 'express';
import axios from 'axios';
const FOLLOW_PRIMARY = process.env.FOLLOW_PRIMARY === 'true';
const PRIMARY_URL = process.env.PRIMARY_URL || 'http://aivis-chan-bot-1st:3002';
// Commands are disabled for follower instances per operator request
const ALLOW_COMMANDS = false;

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
            try { console.log('[SYNC_VOICE_DATA_FROM_PRIMARY] fetched keys=', Object.keys(vd || {}).slice(0,50)); } catch(e) { console.warn('[SYNC_VOICE_DATA_FROM_PRIMARY] inspect failed'); }
            if (vd && vd.voiceSettings) {
                const mod = (await import('./utils/TTS-Engine')) as import('./utils/tts-engine-types').TTSEngineExports;
                try {
                    Object.assign(mod.voiceSettings, vd.voiceSettings);
                    console.log('Primaryボイス設定を同期しました (merged keys=', Object.keys(vd.voiceSettings || {}).length, ')');
                } catch (e) {
                    console.warn('Failed to merge voiceSettings from primary:', e);
                }
            } else {
                console.log('[SYNC_VOICE_DATA_FROM_PRIMARY] no vd.voiceSettings found in response');
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

// ディレクトリ存在確認・作成のヘルパー関数
function ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`ディレクトリを作成しました: ${dirPath}`);
    }
}

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

        // 定期的に設定を再読み込み（30分ごと）
        setInterval(async () => {
            try {
                await syncSettingsFromPrimary();
            } catch (error) {
                console.error('定期設定読み込みでエラー:', error);
            }
        }, 30 * 60 * 1000); // 30分

        // コマンドはフォロワーBotでは無効化されています（sub botはコマンドを使いません）
        console.log("コマンド機能は無効化: このインスタンスはコマンドを持ちません");

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
            { name: '6th', baseUrl: 'http://aivis-chan-bot-6th:3007' },
            { name: 'pro-premium', baseUrl: 'http://aivis-chan-bot-pro-premium:3012' }
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
                console.warn('[SUB Bot] Tierチェックに失敗:', tierError);
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

// インターナル: プライマリからのボイス設定更新通知を受け取る
apiApp.post('/internal/voice-settings-refresh', async (req: any, res: any) => {
    try {
        try { console.log('[VOICE_SETTINGS_REFRESH_RECEIVED] from=', req.body?.from || 'unknown', 'bodyKeys=', Object.keys(req.body || {})); } catch (e) { console.log('Received voice-settings-refresh from primary:', req.body?.from || 'unknown'); }

        if (req.body && req.body.voiceSettings) {
            try {
                const mod = (await import('./utils/TTS-Engine')) as any;
                try {
                    Object.assign(mod.voiceSettings, req.body.voiceSettings);
                } catch (e) {
                    console.warn('voiceSettings merge failed:', e);
                }
                // ランタイムに即時反映できる場合は loadUserVoiceSettings を優先して呼ぶ
                try {
                    if (typeof mod.loadUserVoiceSettings === 'function') {
                        await mod.loadUserVoiceSettings();
                        console.log('loadUserVoiceSettings executed after voice-settings-refresh');
                    } else if (typeof mod.saveUserVoiceSettings === 'function') {
                        await Promise.resolve(mod.saveUserVoiceSettings());
                    } else {
                        const fs = await import('fs'); const path = await import('path');
                        fs.writeFileSync(path.resolve(process.cwd(), 'data', 'voice_settings.json'), JSON.stringify(mod.voiceSettings, null, 2), 'utf8');
                    }
                } catch (e) {
                    console.warn('Failed to persist or reload voiceSettings after refresh:', e);
                }
                console.log('[VOICE_SETTINGS_REFRESH] merged voiceSettings keys=', Object.keys(req.body.voiceSettings || {}).length);
            } catch (e) { console.warn('voiceSettings merge failed:', e); }
        }

        await syncSettingsFromPrimary();
        return res.json({ ok: true });
    } catch (e: any) {
        console.warn('voice-settings-refresh handler error:', String(e));
        return res.status(500).json({ error: 'refresh-failed' });
    }
});
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
apiApp.listen(3005, () => {
    console.log('Stats APIサーバーがポート3005で起動しました');
});
// --- ここまで追加 ---
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
            
            // デフォルト設定を適用
            if (!voiceSettings[guildId]) {
                voiceSettings[guildId] = {};
            }
            
            voiceSettings[guildId].defaultSpeaker = settings.defaultSpeaker || voiceSettings[guildId].defaultSpeaker;
            voiceSettings[guildId].defaultSpeed = settings.defaultSpeed || voiceSettings[guildId].defaultSpeed;
            voiceSettings[guildId].defaultPitch = settings.defaultPitch || voiceSettings[guildId].defaultPitch;
            voiceSettings[guildId].defaultTempo = settings.defaultTempo || voiceSettings[guildId].defaultTempo;
            voiceSettings[guildId].defaultVolume = settings.defaultVolume || voiceSettings[guildId].defaultVolume;
            voiceSettings[guildId].defaultIntonation = settings.defaultIntonation || voiceSettings[guildId].defaultIntonation;
            
            // 設定を保存
            const settingsPath = path.resolve(process.cwd(), 'data', 'voice_settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(voiceSettings, null, 2));
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
            await syncSettingsFromPrimary();
        } else {
            // 全ギルドの設定をリロード
            await syncSettingsFromPrimary();
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

        return res.json({ ok: true });
    } catch (e) {
        console.error('internal/leave error:', e);
        return res.status(500).json({ error: 'leave-failed' });
    }
});

// WEBダッシュボード用: サーバー設定を保存
apiApp.post('/api/settings', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, settings } = req.body;
        
        console.log(`[API /api/settings] Request received for guild: ${guildId}`);
        console.log(`[API /api/settings] Settings:`, JSON.stringify(settings, null, 2));
        
        if (!guildId) {
            console.error(`[API /api/settings] Missing guildId`);
            return res.status(400).json({ success: false, error: 'guildId is required' });
        }

        if (!settings || typeof settings !== 'object') {
            console.error(`[API /api/settings] Invalid settings format`);
            return res.status(400).json({ success: false, error: 'settings must be an object' });
        }

        // 設定をファイルに保存
        const settingsDir = path.join(DATA_DIR, 'guild-settings');
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        
        const settingsFile = path.join(settingsDir, `${guildId}.json`);
        
        // 既存の設定を読み込んでマージ
        let existingSettings: any = {};
        if (fs.existsSync(settingsFile)) {
            try {
                existingSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            } catch (e) {
                console.warn(`[API /api/settings] Failed to parse existing settings for guild ${guildId}`);
            }
        }

        // 新しい設定をマージ
        const mergedSettings = { ...existingSettings, ...settings };
        fs.writeFileSync(settingsFile, JSON.stringify(mergedSettings, null, 2));
        console.log(`[API /api/settings] Settings saved to file for guild ${guildId}`);

        // TTS設定を即座に反映
        const { voiceSettings } = await import('./utils/TTS-Engine');
        
        if (!voiceSettings[guildId]) {
            voiceSettings[guildId] = {};
        }

        // 設定項目のマッピング（キャメルケースとスネークケース両方に対応）
        const settingsMappings = [
            { keys: ['voiceChannelId', 'voice_channel_id'], target: 'voiceChannelId' },
            { keys: ['textChannelId', 'text_channel_id'], target: 'textChannelId' },
            { keys: ['speakerId', 'speaker_id'], target: 'defaultSpeaker' },
            { keys: ['defaultSpeaker', 'default_speaker'], target: 'defaultSpeaker' },
            { keys: ['defaultSpeed', 'default_speed', 'speed'], target: 'defaultSpeed' },
            { keys: ['defaultPitch', 'default_pitch', 'pitch'], target: 'defaultPitch' },
            { keys: ['defaultTempo', 'default_tempo', 'tempo'], target: 'defaultTempo' },
            { keys: ['defaultVolume', 'default_volume', 'volume'], target: 'defaultVolume' },
            { keys: ['defaultIntonation', 'default_intonation', 'intonation'], target: 'defaultIntonation' },
            { keys: ['ignoreBotMessages', 'ignore_bot_messages', 'ignoreBots'], target: 'ignoreBotMessages' },
            { keys: ['autoLeaveOnEmpty', 'auto_leave_on_empty', 'autoLeave'], target: 'autoLeaveOnEmpty' }
        ];

        // 設定を適用
        for (const mapping of settingsMappings) {
            for (const key of mapping.keys) {
                if (settings[key] !== undefined && settings[key] !== null) {
                    voiceSettings[guildId][mapping.target] = settings[key];
                    console.log(`[API /api/settings] Applied ${mapping.target} = ${settings[key]} (from ${key})`);
                    break;
                }
            }
        }
        
        // 設定をファイルに保存
        const voiceSettingsPath = path.resolve(process.cwd(), 'data', 'voice_settings.json');
        fs.writeFileSync(voiceSettingsPath, JSON.stringify(voiceSettings, null, 2));
        console.log(`[API /api/settings] Voice settings saved to file`);

        // 設定を即時反映
        try {
            await loadUserVoiceSettings();
            console.log(`[API /api/settings] Voice settings reloaded for guild=${guildId}`);
        } catch (e) {
            console.warn(`[API /api/settings] Failed to reload voice settings for guild=${guildId}:`, e);
        }

        // 自動退出設定を適用
        if (settings.autoLeaveOnEmpty !== undefined || settings.auto_leave_on_empty !== undefined) {
            const autoLeave = settings.autoLeaveOnEmpty ?? settings.auto_leave_on_empty;
            console.log(`[API /api/settings] Auto-leave setting for guild ${guildId}: ${autoLeave}`);
            
            // 自動退出の監視を開始/停止
            if (autoLeave) {
                console.log(`[API /api/settings] Enabling auto-leave monitoring for guild ${guildId}`);
                // 既存の監視タイマーがあれば停止
                if ((global as any).autoLeaveTimers?.has(guildId)) {
                    const existing = (global as any).autoLeaveTimers.get(guildId);
                    clearInterval(existing);
                }
                
                // 新しい監視タイマーを開始
                if (!(global as any).autoLeaveTimers) {
                    (global as any).autoLeaveTimers = new Map();
                }
                
                const interval = setInterval(async () => {
                    try {
                        const guild = client.guilds.cache.get(guildId);
                        if (!guild) return;

                        const connection = voiceClients[guildId];
                        if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) return;

                        const voiceChannelId = connection.joinConfig.channelId;
                        if (!voiceChannelId) return;
                        
                        const voiceChannel = guild.channels.cache.get(voiceChannelId) as any;
                        if (!voiceChannel) return;

                        // Bot以外のメンバー数をカウント
                        const members = voiceChannel.members.filter((m: any) => !m.user.bot);
                        
                        if (members.size === 0) {
                            console.log(`[Auto-Leave] No members in voice channel for guild ${guildId}, leaving...`);
                            connection.destroy();
                            delete voiceClients[guildId];
                            
                            // タイマーをクリア
                            if ((global as any).autoLeaveTimers?.has(guildId)) {
                                clearInterval((global as any).autoLeaveTimers.get(guildId));
                                (global as any).autoLeaveTimers.delete(guildId);
                            }
                        }
                    } catch (error) {
                        console.error(`[Auto-Leave] Error for guild ${guildId}:`, error);
                    }
                }, 30000); // 30秒ごとにチェック
                
                (global as any).autoLeaveTimers.set(guildId, interval);
                console.log(`[API /api/settings] Auto-leave monitoring enabled for guild ${guildId}`);
            } else {
                console.log(`[API /api/settings] Disabling auto-leave monitoring for guild ${guildId}`);
                // 監視タイマーを停止
                if ((global as any).autoLeaveTimers?.has(guildId)) {
                    const interval = (global as any).autoLeaveTimers.get(guildId);
                    clearInterval(interval);
                    (global as any).autoLeaveTimers.delete(guildId);
                    console.log(`[API /api/settings] Auto-leave monitoring disabled for guild ${guildId}`);
                }
            }
        }

        console.log(`[API /api/settings] Settings applied successfully for guild ${guildId}`);
        res.json({ 
            success: true, 
            message: 'Settings saved and applied',
            appliedSettings: voiceSettings[guildId]
        });
    } catch (error) {
        console.error('[API /api/settings] Error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save settings',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// ギルド情報を取得（チャンネル一覧を含む）
apiApp.get('/internal/guilds/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        console.log(`[API /internal/guilds/${guildId}] Request received`);
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.warn(`[API /internal/guilds/${guildId}] Guild not found`);
            return res.status(404).json({ error: 'guild-not-found' });
        }

        // チャンネル情報を取得
        const channels = Array.from(guild.channels.cache.values()).map(channel => ({
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parentId: (channel as any).parentId || null,
            position: (channel as any).position || 0
        }));

        // ボイス接続状態を取得
        const connection = voiceClients[guildId];
        const voiceConnected = connection ? connection.state.status === VoiceConnectionStatus.Ready : false;
        const voiceChannelId = connection?.joinConfig?.channelId || null;

        // テキストチャンネルを取得
        const textChannelId = getTextChannelForGuild(guildId) || null;

        const guildData = {
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL({ size: 256 }) || null,
            channels: channels,
            voiceConnected: voiceConnected,
            voiceChannelId: voiceChannelId,
            textChannelId: textChannelId
        };

        console.log(`[API /internal/guilds/${guildId}] Returning guild data with ${channels.length} channels`);
        
        res.json(guildData);
    } catch (error) {
        console.error(`[API /internal/guilds/${req.params.guildId}] Error:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch guild data',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// 話者一覧を取得
apiApp.get('/api/speakers', async (req: Request, res: Response) => {
    try {
        console.log('[API /api/speakers] Fetching speakers list');
        
        const speakersPath = path.resolve(process.cwd(), 'data', 'speakers.json');
        
        if (!fs.existsSync(speakersPath)) {
            console.warn('[API /api/speakers] speakers.json not found, fetching from TTS service');
            
            // TTS-Engineから話者情報を取得
            try {
                await fetchAndSaveSpeakers();
            } catch (fetchError) {
                console.error('[API /api/speakers] Failed to fetch speakers:', fetchError);
                return res.status(503).json({ 
                    error: 'Failed to fetch speakers from TTS service',
                    speakers: []
                });
            }
        }

        // speakers.jsonを読み込む
        const speakersData = JSON.parse(fs.readFileSync(speakersPath, 'utf8'));
        
        console.log(`[API /api/speakers] Returning ${speakersData.length} speakers`);
        
        res.json({ 
            success: true,
            speakers: speakersData 
        });
    } catch (error) {
        console.error('[API /api/speakers] Error:', error);
        res.status(500).json({ 
            error: 'Failed to load speakers',
            speakers: [],
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// Bot統計情報を取得（ダッシュボード用）
apiApp.get('/api/stats', async (req: Request, res: Response) => {
    try {
        const serverCount = client.guilds.cache.size;
        const voiceConnectionCount = Object.keys(voiceClients).length;
        const userCount = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount ?? 0), 0);
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        
        // 全ギルドのリストを取得
        const guilds = Array.from(client.guilds.cache.values()).map(guild => ({
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL({ size: 128 }) || null,
            memberCount: guild.memberCount,
            voiceConnected: !!voiceClients[guild.id]
        }));

        const stats = {
            serverCount,
            voiceConnectionCount,
            userCount,
            uptime: Math.floor(uptime),
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024)
            },
            ping: client.ws.ping,
            guilds: guilds,
            timestamp: new Date().toISOString()
        };

        console.log(`[API /api/stats] Returning stats: servers=${serverCount}, vc=${voiceConnectionCount}`);
        
        res.json(stats);
    } catch (error) {
        console.error('[API /api/stats] Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch stats',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// ギルドのサーバー設定を取得
apiApp.get('/api/settings/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        console.log(`[API /api/settings/${guildId}] Fetching guild settings`);
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        const settingsFile = path.join(DATA_DIR, 'guild-settings', `${guildId}.json`);
        
        let settings = {};
        if (fs.existsSync(settingsFile)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            } catch (e) {
                console.warn(`[API /api/settings/${guildId}] Failed to parse settings file`);
            }
        }

        // voiceSettingsからも取得
        const { voiceSettings } = await import('./utils/TTS-Engine');
        const guildVoiceSettings = voiceSettings[guildId] || {};

        // マージ
        const mergedSettings = {
            ...settings,
            ...guildVoiceSettings
        };

        console.log(`[API /api/settings/${guildId}] Returning settings`);
        
        res.json({ 
            success: true,
            settings: mergedSettings 
        });
    } catch (error) {
        console.error(`[API /api/settings/${req.params.guildId}] Error:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch settings',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// 個人設定を取得
apiApp.get('/api/personal-settings/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        console.log(`[API /api/personal-settings/${guildId}] Fetching personal settings`);
        
        // 個人設定はvoice_settings.jsonに保存されている
        const { voiceSettings } = await import('./utils/TTS-Engine');
        const guildSettings = voiceSettings[guildId] || {};

        // ユーザーごとの設定を抽出（キーがuserIdのもの）
        const personalSettings: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(guildSettings)) {
            // userIdパターン（数字のみ）の場合は個人設定
            if (/^\d+$/.test(key)) {
                personalSettings[key] = value;
            }
        }

        console.log(`[API /api/personal-settings/${guildId}] Returning ${Object.keys(personalSettings).length} user settings`);
        
        res.json({ 
            success: true,
            settings: personalSettings 
        });
    } catch (error) {
        console.error(`[API /api/personal-settings/${req.params.guildId}] Error:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch personal settings',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// 辞書を取得
apiApp.get('/api/dictionary/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        console.log(`[API /api/dictionary/${guildId}] Fetching dictionary`);
        
        const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
        
        let dictionary: any[] = [];
        if (fs.existsSync(dictionariesPath)) {
            try {
                const allDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
                const guildDict = allDictionaries[guildId] || {};
                
                // オブジェクト形式を配列形式に変換
                dictionary = Object.entries(guildDict).map(([word, data]: [string, any]) => ({
                    word: word,
                    pronunciation: data.pronunciation || '',
                    accent: data.accent || '',
                    wordType: data.wordType || ''
                }));
            } catch (e) {
                console.warn(`[API /api/dictionary/${guildId}] Failed to parse dictionary file`);
            }
        }

        console.log(`[API /api/dictionary/${guildId}] Returning ${dictionary.length} entries`);
        
        res.json({ 
            success: true,
            dictionary: dictionary 
        });
    } catch (error) {
        console.error(`[API /api/dictionary/${req.params.guildId}] Error:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch dictionary',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// ヘルスチェックエンドポイント
apiApp.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ギルドの設定を取得（Web Dashboard用の互換エンドポイント）
apiApp.get('/internal/settings/:guildId', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        
        console.log(`[API /internal/settings/${guildId}] Request received`);
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        const settingsFile = path.join(DATA_DIR, 'guild-settings', `${guildId}.json`);
        
        let settings = {};
        if (fs.existsSync(settingsFile)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
            } catch (e) {
                console.warn(`[API /internal/settings/${guildId}] Failed to parse settings file`);
            }
        }

        // voiceSettingsからも取得
        const { voiceSettings } = await import('./utils/TTS-Engine');
        const guildVoiceSettings = voiceSettings[guildId] || {};

        // マージ
        const mergedSettings = {
            ...settings,
            ...guildVoiceSettings
        };

        console.log(`[API /internal/settings/${guildId}] Returning ${Object.keys(mergedSettings).length} settings`);
        
        res.json(mergedSettings);
    } catch (error) {
        console.error(`[API /internal/settings/${req.params.guildId}] Error:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch settings',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});

// 辞書を保存
apiApp.post('/api/dictionary', express.json(), async (req: Request, res: Response) => {
    try {
        const { guildId, dictionary } = req.body;
        
        console.log(`[API /api/dictionary POST] Request for guild: ${guildId}, entries: ${dictionary?.length || 0}`);
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        if (!Array.isArray(dictionary)) {
            return res.status(400).json({ error: 'dictionary must be an array' });
        }

        const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
        
        let guildDictionaries: Record<string, any> = {};
        if (fs.existsSync(dictionariesPath)) {
            try {
                guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
            } catch (e) {
                console.warn(`[API /api/dictionary POST] Failed to parse existing dictionaries:`, e);
            }
        }

        // 配列形式をオブジェクト形式に変換
        const convertedDictionary: Record<string, any> = {};
        dictionary.forEach((entry: any) => {
            if (entry.word && entry.pronunciation) {
                convertedDictionary[entry.word] = {
                    pronunciation: entry.pronunciation,
                    accent: entry.accent || 0,
                    wordType: entry.wordType || 'PROPER_NOUN'
                };
            }
        });

        guildDictionaries[guildId] = convertedDictionary;
        
        ensureDirectory(path.dirname(dictionariesPath));
        fs.writeFileSync(dictionariesPath, JSON.stringify(guildDictionaries, null, 2));
        
        console.log(`[API /api/dictionary POST] Dictionary saved: ${Object.keys(convertedDictionary).length} entries`);

        res.json({ 
            success: true, 
            message: 'Dictionary saved successfully',
            entriesCount: Object.keys(convertedDictionary).length
        });
    } catch (error) {
        console.error('[API /api/dictionary POST] Error:', error);
        res.status(500).json({ 
            error: 'Failed to save dictionary',
            details: process.env.NODE_ENV !== 'production' ? String(error) : undefined
        });
    }
});