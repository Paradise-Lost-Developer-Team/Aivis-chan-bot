import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { SubscriptionType, getSubscription, setSubscription, SubscriptionBenefits, getGuildSubscriptionTier } from '../../utils/subscription';
import path from 'path';
import fs from 'fs';

// データディレクトリの確認と作成
function ensureDataDirectoryExists() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        console.log(`データディレクトリを作成します: ${dataDir}`);
        fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
}

export const data = new SlashCommandBuilder()
    .setName('subscription')
    .setDescription('サブスクリプション関連のコマンド')
    .addSubcommand(subcommand =>
        subcommand
            .setName('info')
            .setDescription('サブスクリプションプランの情報を表示します')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('現在のサブスクリプションステータスを確認します')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('upgrade')
            .setDescription('サブスクリプションをアップグレードします')
    );

export async function execute(interaction: { 
    options: { getSubcommand: () => any; getString: (arg0: string) => SubscriptionType; getInteger: (arg0: string) => any; }; 
    guildId: any; 
    reply: (arg0: { embeds?: EmbedBuilder[]; /* replaced ephemeral with flags */ flags?: MessageFlags; content?: string; }) => any; 
    memberPermissions: { has: (arg0: bigint) => any; }; 
}) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'info') {
        const guildId = interaction.guildId;
        let subscriptionType = getGuildSubscriptionTier(guildId) || getSubscription(guildId);
        const benefits = SubscriptionBenefits[subscriptionType];
        
        const subscriptionNames = {
            [SubscriptionType.FREE]: '無料プラン',
            [SubscriptionType.PRO]: 'Proプラン',
            [SubscriptionType.PREMIUM]: 'Premiumプラン'
        };
        
        const embed = new EmbedBuilder()
            .setTitle('サブスクリプション情報')
            .setDescription(`現在のプラン: **${subscriptionNames[subscriptionType]}**`)
            .setColor(
                subscriptionType === SubscriptionType.FREE ? 0x808080 :
                subscriptionType === SubscriptionType.PRO ? 0x00AAFF :
                0xFFD700
            )
            .addFields(
                { name: '利用可能な声優数', value: `${benefits.maxVoices}`, inline: true },
                { name: '辞書登録上限', value: `${benefits.maxDictionaries === 999999 ? '無制限' : benefits.maxDictionaries}`, inline: true },
                { name: 'メッセージ最大長', value: `${benefits.maxMessageLength}文字`, inline: true }
            );
            
        // 特典詳細の追加
        if (subscriptionType === SubscriptionType.PRO) {
            embed.addFields({ 
                name: 'Pro特典',
                value: '• 高品質音声\n• 追加エフェクト\n• 優先キュー' 
            });
        } else if (subscriptionType === SubscriptionType.PREMIUM) {
            embed.addFields({ 
                name: 'Premium特典',
                value: '• 高品質音声\n• 追加エフェクト\n• 独占声優\n• 優先キュー\n• 優先サポート\n• テキスト変換エフェクト\n• 読み上げ中の声優切り替え' 
            });
        }
        
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        
    } else if (subcommand === 'set') {
        // 管理者権限確認
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: 'このコマンドは管理者のみ使用できます。',
                flags: MessageFlags.Ephemeral
            });
        }
        
        const type = interaction.options.getString('type') as SubscriptionType;
        const days = interaction.options.getInteger('days');
        const guildId = interaction.guildId;
        
        setSubscription(guildId, type, days);
        
        const planNames = {
            [SubscriptionType.FREE]: '無料プラン',
            [SubscriptionType.PRO]: 'Proプラン', 
            [SubscriptionType.PREMIUM]: 'Premiumプラン'
        };
        
        await interaction.reply({ 
            content: `サブスクリプションを **${planNames[type]}** に設定しました。期間: ${days}日間`,
            flags: MessageFlags.Ephemeral
        });
    }
}
