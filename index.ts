import { Client, GatewayIntentBits, ActivityType, MessageFlags, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { deployCommands } from "./utils/deploy-commands";
import { REST } from "@discordjs/rest";
import * as fs from "fs";
import * as path from "path";
import { AivisAdapter, loadAutoJoinChannels, loadSpeakers, fetchAndSaveSpeakers, loadUserVoiceSettings } from "./utils/TTS-Engine";
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
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const { TOKEN } = CONFIG;

export interface ExtendedClient extends Client {
    commands: Collection<string, any>;
}

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates] }) as ExtendedClient;
client.commands = new Collection(); // コマンド用の Collection を作成

const rest = new REST({ version: '9' }).setToken(TOKEN);

// Webダッシュボードの設定を読み込む関数
async function loadWebDashboardSettings() {
    const webBaseUrl = process.env.WEB_DASHBOARD_URL || 'http://aivis-chan-bot-web.aivis-chan-bot-web.svc.cluster.local:3001';
    
    try {
        // 全ギルドの設定を読み込み
        for (const guild of client.guilds.cache.values()) {
            try {
                // タイムアウト時間を15秒に延長し、エラーハンドリングを改善
                const timeout = 15000;
                const axiosConfig = { timeout };
                
                const settingsResponse = await axios.get(`${webBaseUrl}/api/settings/${guild.id}`, axiosConfig);
                const dictionaryResponse = await axios.get(`${webBaseUrl}/api/dictionary/${guild.id}`, axiosConfig);

                // 設定を適用
                if (settingsResponse.data?.settings) {
                    const { voiceSettings } = await import('./utils/TTS-Engine');
                    const settings = settingsResponse.data.settings;
                    
                    if (!voiceSettings[guild.id]) {
                        voiceSettings[guild.id] = {};
                    }
                    
                    Object.assign(voiceSettings[guild.id], {
                        defaultSpeaker: settings.defaultSpeaker,
                        defaultSpeed: settings.defaultSpeed,
                        defaultPitch: settings.defaultPitch,
                        defaultTempo: settings.defaultTempo,
                        defaultVolume: settings.defaultVolume,
                        defaultIntonation: settings.defaultIntonation
                    });
                }

                // 辞書を適用
                if (dictionaryResponse.data?.dictionary && dictionaryResponse.data.dictionary.length > 0) {
                    const dictionariesPath = path.resolve(process.cwd(), 'data', 'guild_dictionaries.json');
                    
                    let guildDictionaries: Record<string, any> = {};
                    if (fs.existsSync(dictionariesPath)) {
                        try {
                            guildDictionaries = JSON.parse(fs.readFileSync(dictionariesPath, 'utf8'));
                        } catch (e) {
                            console.warn('Failed to parse existing dictionaries:', e);
                        }
                    }

                    guildDictionaries[guild.id] = dictionaryResponse.data.dictionary.map((entry: any) => ({
                        word: entry.word,
                        pronunciation: entry.pronunciation,
                        accent: entry.accent || '',
                        wordType: entry.wordType || ''
                    }));

                    fs.writeFileSync(dictionariesPath, JSON.stringify(guildDictionaries, null, 2));
                }

                console.log(`Web設定読み込み完了: ${guild.name} (${guild.id})`);
            } catch (guildError: any) {
                if (guildError.code === 'ECONNABORTED' || guildError.message.includes('timeout')) {
                    console.warn(`ギルド ${guild.name} (${guild.id}) の設定読み込みをスキップ: timeout of ${guildError.timeout || 'unknown'}ms exceeded`);
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
        // loadJoinChannels(); // 動的判定により不要
        loadSpeakers();
        loadUserVoiceSettings();
        
        console.log("TTS初期化完了");

        AivisAdapter();
        console.log("AivisAdapter初期化完了");
        
        // Webダッシュボードの設定を読み込み
        try {
            await loadWebDashboardSettings();
            console.log("Webダッシュボード設定読み込み完了");
        } catch (webError) {
            console.warn("Webダッシュボード設定読み込み失敗:", webError);
        }
        
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
            { name: '1st', baseUrl: 'http://aivis-chan-bot-1st:3002' },
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
                        console.log(`[cluster] VC数取得開始: ${b.name} (${b.baseUrl})`);
            const { data } = await axios.get<{ vcCount?: number }>(`${b.baseUrl}/internal/info`, { 
                            timeout: timeoutMs,
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'ClusterVCCounter/1.0'
                            }
                        });
                        const vcCount = (typeof data?.vcCount === 'number') ? (data.vcCount as number) : 0;
                        console.log(`[cluster] VC数取得成功: ${b.name} -> ${vcCount}`);
            return vcCount;
                    } catch (error: any) {
                        console.warn(`[cluster] VC数取得失敗: ${b.name} -> ${error.message || error}`);
                        return 0;
                    }
                }));
        const sum = results.reduce((a: number, c: number) => a + c, 0);
                console.log(`[cluster] 総VC数: ${sum} (自身: ${selfCount})`);
                return Math.max(sum, selfCount);
            } catch (error) {
                console.error(`[cluster] getClusterVCCount全体エラー: ${error}`);
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
                { name: '基本コマンド', value: '• /help\n• /join\n• /leave' }
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
apiApp.listen(3002, () => {
    console.log('Stats APIサーバーがポート3002で起動しました');
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
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { textChannels, voiceClients } from './utils/TTS-Engine';
import { saveVoiceState, getTextChannelForGuild } from './utils/voiceStateManager';

apiApp.post('/internal/join', async (req: Request, res: Response) => {
    try {
        const { guildId, voiceChannelId, textChannelId } = req.body || {};
        if (!guildId || !voiceChannelId) return res.status(400).json({ error: 'guildId and voiceChannelId are required' });
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'guild-not-found' });
        const voiceChannel = guild.channels.cache.get(voiceChannelId) as any;
        if (!voiceChannel || voiceChannel.type !== 2) return res.status(400).json({ error: 'voice-channel-invalid' });

        // テキストチャンネルの決定ロジックを改善
        let finalTextChannelId = textChannelId;

        if (!finalTextChannelId) {
            // 1. 保存されたテキストチャンネルを取得
            finalTextChannelId = getTextChannelForGuild(guildId);
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

        if (!finalTextChannelId) {
            // 4. ギルドのシステムチャンネルを使用
            if (guild.systemChannel && guild.systemChannel.type === 0) {
                finalTextChannelId = guild.systemChannel.id;
            }
        }

        if (!finalTextChannelId) {
            // 5. 一般チャンネルを探す
            const generalChannel = guild.channels.cache.find(ch =>
                ch.type === 0 && (ch.name.includes('general') || ch.name.includes('一般'))
            );
            if (generalChannel) {
                finalTextChannelId = generalChannel.id;
            }
        }

        if (!finalTextChannelId) {
            // 6. 最初のテキストチャンネルを使用
            const firstTextChannel = guild.channels.cache.find(ch => ch.type === 0);
            if (firstTextChannel) {
                finalTextChannelId = firstTextChannel.id;
            }
        }

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
                    (textChannels as any)[guildId] = tc;
                    console.log(`[internal/join] 成功: ギルド ${guildId} のテキストチャンネルを設定: ${tc.name} (${finalTextChannelId})`);
                } else {
                    console.warn(`[internal/join] テキストチャンネル設定失敗: ギルド ${guildId} チャンネル ${finalTextChannelId} - 存在: ${!!tc}, タイプ: ${tc?.type}`);
                    
                    // フォールバック: 利用可能なテキストチャンネルを探す
                    const fallbackChannel = guild.channels.cache.find(ch => 
                        ch.type === 0 && 
                        ch.permissionsFor(guild.members.me!)?.has(['ViewChannel', 'SendMessages'])
                    ) as any;
                    
                    if (fallbackChannel) {
                        (textChannels as any)[guildId] = fallbackChannel;
                        finalTextChannelId = fallbackChannel.id;
                        console.log(`[internal/join] フォールバック成功: ギルド ${guildId} チャンネル ${fallbackChannel.name} (${fallbackChannel.id}) を使用`);
                    }
                }
            } catch (error) {
                console.error(`[internal/join] テキストチャンネル設定エラー: ギルド ${guildId}:`, error);
            }
        } else {
            console.warn(`[internal/join] ギルド ${guildId} の適切なテキストチャンネルが見つかりませんでした`);
        }

        const prev = getVoiceConnection(guildId);
        if (prev) { try { prev.destroy(); } catch {} delete voiceClients[guildId]; }
        const connection = joinVoiceChannel({ channelId: voiceChannelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
        voiceClients[guildId] = connection;
        setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 1000);

        // 音声アナウンスを再生
        try {
            const { speakAnnounce } = await import('./utils/TTS-Engine');
            await speakAnnounce('接続しました', guildId, client);
            console.log(`[internal/join] 音声アナウンス再生完了: ギルド ${guildId}`);
        } catch (voiceAnnounceError) {
            console.error(`[internal/join] 音声アナウンスエラー: ギルド ${guildId}:`, voiceAnnounceError);
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

// ボイス設定を取得するAPI
apiApp.get('/internal/voice-settings', async (req: Request, res: Response) => {
    try {
        const { voiceSettings } = await import('./utils/TTS-Engine');
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

        // ギルドのTier情報を取得
        const { getGuildTier } = await import('./utils/patreonIntegration');
        const guildTier = await getGuildTier(guildId, client);

        // テキストチャンネルの決定ロジック
        let finalTextChannelId = null;

        // 1. 保存されたテキストチャンネルを取得
        finalTextChannelId = getTextChannelForGuild(guildId);

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

        // テキストチャンネルが見つかった場合のみ設定
        if (finalTextChannelId) {
            console.log(`[text-channel API] ギルド ${guildId}: テキストチャンネル ${finalTextChannelId} を確認中`);
            
            try {
                // チャンネルをフェッチして最新の情報を取得
                const tc = await guild.channels.fetch(finalTextChannelId).catch(() => null);
                
                if (tc && tc.type === 0) {
                    console.log(`[text-channel API] 成功: ギルド ${guildId} テキストチャンネル ${tc.name} (${finalTextChannelId})`);
                    return res.json({
                        ok: true,
                        textChannelId: finalTextChannelId,
                        textChannelName: tc.name,
                        guildTier: guildTier // ギルドTier情報を追加
                    });
                } else {
                    // チャンネルがキャッシュにない場合はキャッシュから確認
                    const cachedChannel = guild.channels.cache.get(finalTextChannelId) as any;
                    if (cachedChannel && cachedChannel.type === 0) {
                        console.log(`[text-channel API] キャッシュから成功: ギルド ${guildId} テキストチャンネル ${cachedChannel.name} (${finalTextChannelId})`);
                        return res.json({
                            ok: true,
                            textChannelId: finalTextChannelId,
                            textChannelName: cachedChannel.name,
                            guildTier: guildTier
                        });
                    } else {
                        console.warn(`[text-channel API] テキストチャンネル無効: ギルド ${guildId} チャンネル ${finalTextChannelId} - フェッチ結果: ${!!tc}, タイプ: ${tc?.type}, キャッシュ結果: ${!!cachedChannel}, キャッシュタイプ: ${cachedChannel?.type}`);
                        
                        // 明示的なテキストチャンネル設定が無効な場合はエラーを返す
                        // フォールバック処理は行わない
                        return res.status(404).json({ 
                            error: 'text-channel-invalid',
                            details: {
                                guildId,
                                requestedChannelId: finalTextChannelId,
                                channelExists: !!tc,
                                channelType: tc?.type,
                                availableChannels: guild.channels.cache.filter(ch => ch.type === 0).size
                            }
                        });
                    }
                }
            } catch (fetchError) {
                console.error(`[text-channel API] チャンネルフェッチエラー: ギルド ${guildId} チャンネル ${finalTextChannelId}:`, fetchError);
                return res.status(500).json({ 
                    error: 'channel-fetch-failed',
                    details: { guildId, channelId: finalTextChannelId }
                });
            }
        } else {
            console.warn(`[text-channel API] テキストチャンネルが見つからない: ギルド ${guildId}`);
            return res.status(404).json({ error: 'no-text-channel-found' });
        }
    } catch (e) {
        console.error('text-channel API error:', e);
        return res.status(500).json({ error: 'text-channel-failed' });
    }
});

apiApp.post('/internal/leave', async (req: Request, res: Response) => {
    try {
        const { guildId } = req.body || {};
        if (!guildId) return res.status(400).json({ error: 'guildId is required' });

        const prev = getVoiceConnection(guildId);
        if (prev) {
            try { prev.destroy(); } catch {}
        }
        try { delete voiceClients[guildId]; } catch {}
        try { delete (textChannels as any)[guildId]; } catch {}
        setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 500);
        return res.json({ ok: true });
    } catch (e) {
        console.error('internal/leave error:', e);
        return res.status(500).json({ error: 'leave-failed' });
    }
});