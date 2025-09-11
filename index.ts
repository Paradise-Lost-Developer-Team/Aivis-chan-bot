import { Client, GatewayIntentBits, ActivityType, MessageFlags, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { deployCommands } from "./utils/deploy-commands";
import { REST } from "@discordjs/rest";
import { getUserTierByOwnership, getGuildTier } from "./utils/patreonIntegration";
import * as fs from "fs";
import * as path from "path";
import { AivisAdapter, loadAutoJoinChannels, loadJoinChannels, loadSpeakers, fetchAndSaveSpeakers, loadUserVoiceSettings } from "./utils/TTS-Engine";
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
        loadJoinChannels();
        loadSpeakers();
        loadUserVoiceSettings();
        
        console.log("TTS初期化完了");

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
            { name: '1st', baseUrl: 'http://aivis-chan-bot-pro-premium:3012' },
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

    // テキストチャンネルの決定ロジックを改善（Proは単独で完結）
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
            // 4. ギルドのシステムチャンネル
            if (guild.systemChannel && guild.systemChannel.type === 0) {
                finalTextChannelId = guild.systemChannel.id;
            }
        }

        if (!finalTextChannelId) {
            // 5. 一般 or 最初のテキストチャンネル
            const generalChannel = guild.channels.cache.find(ch => ch.type === 0 && (ch.name.includes('general') || ch.name.includes('一般')));
            finalTextChannelId = (generalChannel && (generalChannel as any).id) || (guild.channels.cache.find(ch => ch.type === 0) as any)?.id || null;
        }

        // テキストチャンネルが見つかった場合のみ設定
        if (finalTextChannelId) {
            const tc = guild.channels.cache.get(finalTextChannelId) as any;
            if (tc && tc.type === 0) {
                (textChannels as any)[guildId] = tc;
                console.log(`ギルド ${guildId} のテキストチャンネルを設定: ${tc.name} (${finalTextChannelId})`);
            } else {
                console.warn(`ギルド ${guildId} のテキストチャンネルが見つからないか無効: ${finalTextChannelId}`);
            }
        } else {
            console.warn(`ギルド ${guildId} の適切なテキストチャンネルが見つかりませんでした`);
        }

        const prev = getVoiceConnection(guildId);
        if (prev) { try { prev.destroy(); } catch {} delete voiceClients[guildId]; }
        const connection = joinVoiceChannel({ channelId: voiceChannelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
        voiceClients[guildId] = connection;
        setTimeout(()=>{ try { saveVoiceState(client as any); } catch {} }, 1000);
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

        if (!finalTextChannelId) {
            // 4. ギルドのシステムチャンネルを使用
            if (guild.systemChannel && guild.systemChannel.type === 0) {
                finalTextChannelId = guild.systemChannel.id;
            }
        }

        if (!finalTextChannelId) {
            // 5. 一般チャンネル → なければ最初のテキストチャンネル
            const generalChannel = guild.channels.cache.find(ch => ch.type === 0 && (ch.name.includes('general') || ch.name.includes('一般')));
            finalTextChannelId = (generalChannel && (generalChannel as any).id) || (guild.channels.cache.find(ch => ch.type === 0) as any)?.id || null;
        }

        // テキストチャンネルが見つかった場合のみ設定
        if (finalTextChannelId) {
            const tc = guild.channels.cache.get(finalTextChannelId) as any;
            if (tc && tc.type === 0) {
                return res.json({
                    ok: true,
                    textChannelId: finalTextChannelId,
                    textChannelName: tc.name,
                    guildTier: guildTier // ギルドTier情報を追加
                });
            } else {
                return res.status(404).json({ error: 'text-channel-invalid' });
            }
        } else {
            return res.status(404).json({ error: 'no-text-channel-found' });
        }
    } catch (e) {
        console.error('text-channel API error:', e);
        return res.status(500).json({ error: 'text-channel-failed' });
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