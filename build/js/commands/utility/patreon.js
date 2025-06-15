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
exports.data = void 0;
exports.execute = execute;
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// データディレクトリの確認と作成
function ensureDataDirectoryExists() {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
        console.log(`データディレクトリを作成します: ${dataDir}`);
        fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
}
// Slashコマンドのデータ定義
exports.data = new builders_1.SlashCommandBuilder()
    .setName('patreon')
    .setDescription('Patreon連携関連のコマンド')
    .addSubcommand(subcommand => subcommand
    .setName('info')
    .setDescription('Patreon連携についての情報を表示します'))
    .addSubcommand(subcommand => subcommand
    .setName('link')
    .setDescription('PatreonアカウントとBotを連携します'))
    .addSubcommand(subcommand => subcommand
    .setName('status')
    .setDescription('現在のPatreon連携状況を確認します'));
// コマンド実行ロジック
async function execute(interaction) {
    try {
        // コマンド実行前にデータディレクトリ存在確認
        ensureDataDirectoryExists();
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case 'info':
                await handleInfoSubcommand(interaction);
                break;
            case 'link':
                await handleLinkSubcommand(interaction);
                break;
            case 'status':
                await handleStatusSubcommand(interaction);
                break;
            default:
                await interaction.reply({
                    content: '不明なサブコマンドです。',
                    ephemeral: true
                });
        }
    }
    catch (error) {
        console.error('Patreonコマンドエラー:', error);
        await interaction.reply({
            content: 'コマンド実行中にエラーが発生しました。しばらく経ってから再度お試しください。',
            ephemeral: true
        });
    }
}
// サブコマンドハンドラー関数
async function handleInfoSubcommand(interaction) {
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('Patreon連携について')
        .setDescription('Aivis Chan Botの開発をPatreonで支援すると、特典が自動で適用されます。')
        .addFields({ name: '連携方法', value: '`/patreon link` コマンドを実行し、表示されるリンクからPatreonアカウントで認証してください。' }, { name: '特典プラン', value: '**Pro版 (¥500/月)**: 追加ボイス、高品質音声\n**Premium版 (¥1000/月)**: 独占ボイス、無制限辞書' }, { name: '連携状況確認', value: '`/patreon status` コマンドで現在の連携状況を確認できます。' })
        .setColor(0xFF5500);
    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}
async function handleLinkSubcommand(interaction) {
    const { getPatreonAuthUrl } = await Promise.resolve().then(() => __importStar(require('../../utils/patreonIntegration')));
    const authUrl = getPatreonAuthUrl(interaction.user.id);
    await interaction.reply({
        content: 'PatreonアカウントとAivis Chan Botを連携するには、以下のリンクをクリックしてください：\n\n' +
            `[Patreonで認証する](${authUrl})\n\n` +
            '認証後、自動的にDiscordアカウントと連携され、支援Tierに応じた特典が適用されます。',
        ephemeral: true
    });
}
async function handleStatusSubcommand(interaction) {
    // パトレオン連携からユーザー情報を取得
    const { getUserTier } = await Promise.resolve().then(() => __importStar(require('../../utils/patreonIntegration')));
    const userTier = await getUserTier(interaction.user.id);
    let tierInfo = '連携されていません';
    let color = 0x888888; // Using a gray color instead
    if (userTier === 'free') {
        tierInfo = '連携済み (無料プラン)';
        color = 0x00AAFF;
    }
    else if (userTier === 'pro') {
        tierInfo = '連携済み (Pro版)';
        color = 0xFF5500;
    }
    else if (userTier === 'premium') {
        tierInfo = '連携済み (Premium版)';
        color = 0xFF0000;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle('Patreon連携状況')
        .setDescription(`現在の連携状況: **${tierInfo}**`)
        .setColor(color);
    if (userTier === 'free' || !userTier) {
        embed.addFields({
            name: 'アップグレード',
            value: 'Proまたはプレミアム特典を受けるには、Patreonで支援してください。\n`/patreon link` コマンドで連携できます。'
        });
    }
    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}
//# sourceMappingURL=patreon.js.map