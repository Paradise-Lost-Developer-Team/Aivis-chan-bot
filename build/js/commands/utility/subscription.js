"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.execute = execute;
const discord_js_1 = require("discord.js");
const subscription_1 = require("../../utils/subscription");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// データディレクトリの確認と作成
function ensureDataDirectoryExists() {
    const dataDir = path_1.default.join(__dirname, '../data');
    if (!fs_1.default.existsSync(dataDir)) {
        console.log(`データディレクトリを作成します: ${dataDir}`);
        fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
}
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('subscription')
    .setDescription('サブスクリプション関連のコマンド')
    .addSubcommand(subcommand => subcommand
    .setName('info')
    .setDescription('サブスクリプションプランの情報を表示します'))
    .addSubcommand(subcommand => subcommand
    .setName('status')
    .setDescription('現在のサブスクリプションステータスを確認します'))
    .addSubcommand(subcommand => subcommand
    .setName('upgrade')
    .setDescription('サブスクリプションをアップグレードします'));
async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'info') {
        const guildId = interaction.guildId;
        let subscriptionType = (0, subscription_1.getGuildSubscriptionTier)(guildId) || (0, subscription_1.getSubscription)(guildId);
        const benefits = subscription_1.SubscriptionBenefits[subscriptionType];
        const subscriptionNames = {
            [subscription_1.SubscriptionType.FREE]: '無料プラン',
            [subscription_1.SubscriptionType.PRO]: 'Proプラン',
            [subscription_1.SubscriptionType.PREMIUM]: 'Premiumプラン'
        };
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle('サブスクリプション情報')
            .setDescription(`現在のプラン: **${subscriptionNames[subscriptionType]}**`)
            .setColor(subscriptionType === subscription_1.SubscriptionType.FREE ? 0x808080 :
            subscriptionType === subscription_1.SubscriptionType.PRO ? 0x00AAFF :
                0xFFD700)
            .addFields({ name: '利用可能な声優数', value: `${benefits.maxVoices}`, inline: true }, { name: '辞書登録上限', value: `${benefits.maxDictionaries === 999999 ? '無制限' : benefits.maxDictionaries}`, inline: true }, { name: 'メッセージ最大長', value: `${benefits.maxMessageLength}文字`, inline: true });
        // 特典詳細の追加
        if (subscriptionType === subscription_1.SubscriptionType.PRO) {
            embed.addFields({
                name: 'Pro特典',
                value: '• 高品質音声\n• 追加エフェクト\n• 優先キュー'
            });
        }
        else if (subscriptionType === subscription_1.SubscriptionType.PREMIUM) {
            embed.addFields({
                name: 'Premium特典',
                value: '• 高品質音声\n• 追加エフェクト\n• 独占声優\n• 優先キュー\n• 優先サポート\n• テキスト変換エフェクト\n• 読み上げ中の声優切り替え'
            });
        }
        await interaction.reply({ embeds: [embed], flags: discord_js_1.MessageFlags.Ephemeral });
    }
    else if (subcommand === 'set') {
        // 管理者権限確認
        if (!interaction.memberPermissions.has(discord_js_1.PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'このコマンドは管理者のみ使用できます。',
                flags: discord_js_1.MessageFlags.Ephemeral
            });
        }
        const type = interaction.options.getString('type');
        const days = interaction.options.getInteger('days');
        const guildId = interaction.guildId;
        (0, subscription_1.setSubscription)(guildId, type, days);
        const planNames = {
            [subscription_1.SubscriptionType.FREE]: '無料プラン',
            [subscription_1.SubscriptionType.PRO]: 'Proプラン',
            [subscription_1.SubscriptionType.PREMIUM]: 'Premiumプラン'
        };
        await interaction.reply({
            content: `サブスクリプションを **${planNames[type]}** に設定しました。期間: ${days}日間`,
            flags: discord_js_1.MessageFlags.Ephemeral
        });
    }
}
//# sourceMappingURL=subscription.js.map