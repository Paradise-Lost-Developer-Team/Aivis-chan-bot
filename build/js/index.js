"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = void 0;
const discord_js_1 = require("discord.js");
const deploy_commands_1 = require("./utils/deploy-commands");
const rest_1 = require("@discordjs/rest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TTS_Engine_1 = require("./utils/TTS-Engine");
const dictionaries_1 = require("./utils/dictionaries");
const MessageCreate_1 = require("./utils/MessageCreate");
const VoiceStateUpdate_1 = require("./utils/VoiceStateUpdate");
const errorLogger_1 = require("./utils/errorLogger");
const voiceStateManager_1 = require("./utils/voiceStateManager");
require("./utils/patreonIntegration"); // Patreon連携モジュールをインポート
const conversation_tracking_service_1 = require("./utils/conversation-tracking-service"); // 会話分析サービス
const voiceStamp_1 = require("./utils/voiceStamp"); // ボイススタンプ機能をインポート
const sentry_1 = require("./utils/sentry");
const voice_1 = require("@discordjs/voice");
// アプリケーション起動の最初にSentryを初期化
(0, sentry_1.initSentry)();
// 相対パス (プロジェクトルート) を使うよう変更
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
    console.log(`データディレクトリを作成します: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const CONFIG_PATH = path.resolve(process.cwd(), 'data', 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const { TOKEN } = CONFIG;
exports.client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.MessageContent, discord_js_1.GatewayIntentBits.GuildVoiceStates] });
exports.client.commands = new discord_js_1.Collection(); // コマンド用の Collection を作成
const rest = new rest_1.REST({ version: '9' }).setToken(TOKEN);
// 未処理の例外をハンドリング
process.on('uncaughtException', (error) => {
    console.error('未処理の例外が発生しました：', error);
    (0, errorLogger_1.logError)('uncaughtException', error);
    // クラッシュが深刻な場合は再起動させる（PM2が再起動を担当）
    if (error.message.includes('FATAL') || error.message.includes('CRITICAL')) {
        console.error('深刻なエラーのため、プロセスを終了します。');
        process.exit(1);
    }
});
// 未処理のPromiseリジェクトをハンドリング
process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromiseリジェクションが発生しました：', reason);
    (0, errorLogger_1.logError)('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});
// グレースフルシャットダウン処理
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
async function gracefulShutdown() {
    console.log('シャットダウン中...');
    // voice connectionsはclient.destroy()で自動的に切断される
    // Discordクライアントからログアウト
    await exports.client.destroy();
    console.log('正常にシャットダウンしました');
    process.exit(0);
}
exports.client.once("ready", async () => {
    try {
        // 起動時にAivisSpeech Engineから話者情報を取得しspeakers.jsonに保存
        await (0, TTS_Engine_1.fetchAndSaveSpeakers)();
        await (0, deploy_commands_1.deployCommands)(exports.client);
        console.log("コマンドのデプロイ完了");
        // ボイスチャンネル再接続を先に実行し、完全に完了するまで待機
        console.log('ボイスチャンネルへの再接続を試みています...');
        await (0, voiceStateManager_1.reconnectToVoiceChannels)(exports.client);
        console.log('ボイスチャンネル再接続処理が完了しました');
        // --- 追加: 各ギルドのVoiceConnectionがReadyになるまで待機 ---
        const { voiceClients } = await Promise.resolve().then(() => __importStar(require('./utils/TTS-Engine')));
        const waitForReady = async (vc, guildId) => {
            try {
                await (0, voice_1.entersState)(vc, voice_1.VoiceConnectionStatus.Ready, 10000);
            }
            catch (e) {
                console.warn(`ギルド${guildId}のVoiceConnectionがReadyになりませんでした:`, e);
            }
        };
        for (const [guildId, vc] of Object.entries(voiceClients)) {
            if (vc && vc.state.status !== voice_1.VoiceConnectionStatus.Ready) {
                await waitForReady(vc, guildId);
            }
        }
        // --- 追加ここまで ---
        // 会話統計トラッキングサービスの初期化
        console.log("会話分析サービスを初期化しています...");
        const conversationTrackingService = conversation_tracking_service_1.ConversationTrackingService.getInstance(exports.client);
        conversationTrackingService.setupEventListeners();
        console.log("会話分析サービスの初期化が完了しました");
        // ボイススタンプ機能の初期化
        console.log("ボイススタンプ機能を初期化しています...");
        const voiceStampManager = voiceStamp_1.VoiceStampManager.getInstance(exports.client);
        (0, voiceStamp_1.setupVoiceStampEvents)(exports.client);
        console.log("ボイススタンプ機能の初期化が完了しました");
        // TTS関連の初期化を先に実行
        console.log("TTS初期化中...");
        (0, TTS_Engine_1.loadAutoJoinChannels)();
        (0, TTS_Engine_1.loadJoinChannels)();
        (0, TTS_Engine_1.loadSpeakers)();
        (0, TTS_Engine_1.loadUserSpeakers)();
        console.log("TTS初期化完了");
        (0, TTS_Engine_1.AivisAdapter)();
        console.log("AivisAdapter初期化完了");
        // 再接続が完了した後で他の機能を初期化
        (0, MessageCreate_1.MessageCreate)(exports.client);
        (0, VoiceStateUpdate_1.VoiceStateUpdate)(exports.client);
        console.log("起動完了");
        exports.client.user.setActivity("起動完了", { type: discord_js_1.ActivityType.Playing });
        // 辞書データ関連の処理を後で行う（エラーがあっても再接続には影響しない）
        try {
            (0, dictionaries_1.fetchUUIDsPeriodically)();
        }
        catch (dictError) {
            console.error("辞書データ取得エラー:", dictError);
            (0, errorLogger_1.logError)('dictionaryError', dictError instanceof Error ? dictError : new Error(String(dictError)));
        }
        exports.client.guilds.cache.forEach(guild => {
            try {
                new dictionaries_1.ServerStatus(guild.id); // 各ギルドのIDを保存するタスクを開始
            }
            catch (error) {
                console.error(`Guild ${guild.id} のステータス初期化エラー:`, error);
                (0, errorLogger_1.logError)('serverStatusError', error instanceof Error ? error : new Error(String(error)));
            }
        });
        setInterval(async () => {
            try {
                const joinServerCount = exports.client.guilds.cache.size;
                exports.client.user.setActivity(`サーバー数: ${joinServerCount}`, { type: discord_js_1.ActivityType.Custom });
                await new Promise(resolve => setTimeout(resolve, 15000));
                const joinVCCount = exports.client.voice.adapters.size;
                exports.client.user.setActivity(`VC: ${joinVCCount}`, { type: discord_js_1.ActivityType.Custom });
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
            catch (error) {
                console.error("ステータス更新エラー:", error);
                (0, errorLogger_1.logError)('statusUpdateError', error instanceof Error ? error : new Error(String(error)));
            }
        }, 30000);
    }
    catch (error) {
        console.error("Bot起動エラー:", error);
        (0, errorLogger_1.logError)('botStartupError', error instanceof Error ? error : new Error(String(error)));
    }
});
exports.client.on("interactionCreate", async (interaction) => {
    try {
        // スラッシュコマンド処理
        if (interaction.isChatInputCommand()) {
            const command = exports.client.commands.get(interaction.commandName);
            if (!command)
                return;
            try {
                await command.execute(interaction);
            }
            catch (error) {
                console.error(`コマンド実行エラー (${interaction.commandName}):`, error);
                // インタラクションの応答状態に基づいて適切に対応
                if (interaction.replied || interaction.deferred) {
                    try {
                        await interaction.followUp({
                            content: 'コマンド実行時にエラーが発生しました',
                            flags: discord_js_1.MessageFlags.Ephemeral
                        });
                    }
                    catch (e) {
                        if (e.code !== 10062) // Unknown interaction以外のエラーのみログ
                            console.error("FollowUp失敗:", e);
                    }
                }
                else {
                    try {
                        await interaction.reply({
                            content: 'コマンド実行時にエラーが発生しました',
                            flags: discord_js_1.MessageFlags.Ephemeral
                        });
                    }
                    catch (e) {
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
    }
    catch (error) {
        console.error('インタラクション処理エラー:', error);
    }
});
exports.client.on("guildCreate", async (guild) => {
    try {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('Aivis Chan Botが導入されました！')
            .setDescription('Aivis Chan Botを導入いただきありがとうございます。Discordサーバーにてメッセージ読み上げ等を行う便利BOTです。')
            .addFields({ name: 'BOTの概要', value: '音声合成を活用した読み上げBotです。多彩な話者やエフェクトを使えます。' }, { name: '主要特徴', value: '• カスタマイズ可能な読み上げ\n• 豊富な音声エフェクト\n• カスタム辞書の登録' }, { name: '基本コマンド', value: '• /help\n• /join\n• /leave' }, { name: '🌟 プレミアムプラン', value: '• Pro版: 追加の声優、優先キュー、高品質音声\n• Premium版: 独占ボイス、無制限辞書、優先サポート\n• 詳細は `/subscription info` で確認' }, { name: '💰 Patreon連携', value: 'PatreonでBot開発をサポートすると、Pro版やPremium版の特典が自動で適用されます！\n• `/patreon link` コマンドでPatreonアカウントを連携\n• 支援Tierに応じて特典が自動有効化' })
            .setFooter({ text: 'Powered by AivisSpeech' })
            .setColor(0x00AAFF);
        const row = new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder()
            .setLabel('利用規約')
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setURL('https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Term-of-Service'), new discord_js_1.ButtonBuilder()
            .setLabel('プライバシーポリシー')
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setURL('https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Privacy-Policy'), new discord_js_1.ButtonBuilder()
            .setLabel('購読プラン')
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setURL('https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Subscription'), new discord_js_1.ButtonBuilder()
            .setLabel('Patreonで支援する')
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setURL('https://www.patreon.com/c/AlcJP02'), new discord_js_1.ButtonBuilder()
            .setLabel('サポートサーバー')
            .setStyle(discord_js_1.ButtonStyle.Link)
            .setURL('https://discord.gg/c4TrxUD5XX'));
        const systemChannel = guild.systemChannel;
        if (systemChannel && systemChannel.isTextBased()) {
            await systemChannel.send({ embeds: [embed], components: [row] });
        }
    }
    catch (error) {
        console.error('Error sending welcome embed:', error);
    }
});
exports.client.login(TOKEN).catch(error => {
    console.error("ログインエラー:", error);
    (0, errorLogger_1.logError)('loginError', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map