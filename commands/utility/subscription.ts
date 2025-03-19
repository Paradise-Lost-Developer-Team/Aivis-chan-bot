import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getGuildSubscriptionTier, SubscriptionTier, getUserSubscription, isProFeatureAvailable, getSubscriptionInfo } from '../../utils/subscription';
import { getProPlanInfo } from '../../utils/pro-features';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('subscription')
        .setDescription('サブスクリプション情報の確認と購入')
        .addSubcommand(subcommand =>
            subcommand.setName('info')
            .setDescription('現在のサブスクリプション状態を確認します'))
        .addSubcommand(subcommand =>
            subcommand.setName('purchase')
            .setDescription('Pro版/Premium版の購入方法を表示します'))
        .addSubcommand(subcommand =>
            subcommand.setName('manage')
            .setDescription('サブスクリプションの管理情報を表示します')),
    
    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild?.id;
        
        if (!guildId) {
            await interaction.reply({
                content: 'このコマンドはサーバー内でのみ使用できます。',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        if (subcommand === 'info') {
            await handleInfoCommand(interaction, guildId);
        } else if (subcommand === 'purchase') {
            await handlePurchaseCommand(interaction);
        } else if (subcommand === 'manage') {
            await handleManageCommand(interaction, guildId);
        }
    }
};

async function handleInfoCommand(interaction: ChatInputCommandInteraction, guildId: string) {
    const tier = getGuildSubscriptionTier(guildId);
    const planInfo = getProPlanInfo(guildId);
    
    const embed = new EmbedBuilder()
        .setTitle('サブスクリプション情報')
        .setDescription(`このサーバーのサブスクリプション状態: ${planInfo}`)
        .setColor(tier === SubscriptionTier.FREE ? '#808080' : 
                 tier === SubscriptionTier.PRO ? '#FFD700' : '#FF4500')
        .addFields(
            { name: '現在のプラン', value: tier.toUpperCase() },
            { name: '機能制限', value: getFeatureLimitInfo(tier) }
        )
        .setFooter({ text: 'Aivis-chan Bot Pro版の詳細は /subscription purchase で確認できます' });
    
    // 自分のサブスクリプション情報があれば追加
    const userSubscription = getUserSubscription(interaction.user.id);
    if (userSubscription && userSubscription.active) {
        embed.addFields(
            { name: 'あなたのサブスクリプション', value: `プラン: ${userSubscription.tier.toUpperCase()}` },
            { name: '有効期限', value: new Date(userSubscription.endDate).toLocaleDateString() }
        );
    } 
    
    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

async function handlePurchaseCommand(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
        .setTitle('Pro版/Premium版の購入')
        .setDescription('Aivis-chan Bot Pro版/Premium版は以下の特典があります。')
        .setColor('#FFD700')
        .addFields(
            { name: 'Pro版特典', value: 
                '- 読み上げ文字数制限400文字\n' + 
                '- Pro版専用の追加音声\n' +
                '- 優先サポート\n' +
                '価格: 月額500円 または 年額5,000円'
            },
            { name: 'Premium版特典', value: 
                '- 読み上げ文字数制限800文字\n' + 
                '- Premium版専用の追加音声\n' +
                '- すべてのPro版特典を含む\n' +
                '- 最優先サポート\n' +
                '価格: 月額1,000円 または 年額10,000円'
            },
            { name: '購入方法', value: '下記リンクから購入手続きを行ってください。' }
        );
    
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Pro版を購入')
                .setURL('https://aivis-bot.example.com/purchase/pro')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('Premium版を購入')
                .setURL('https://aivis-bot.example.com/purchase/premium')
                .setStyle(ButtonStyle.Link)
        );
    
    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function handleManageCommand(interaction: ChatInputCommandInteraction, guildId: string) {
    const info = getSubscriptionInfo(guildId);
                    
    let subscriptionName: string;
    let color: number;
    let features: string;
        
    switch (info.type) {
        case SubscriptionTier.PREMIUM:
            subscriptionName = 'Premium';
            color = 0xFFD700; // ゴールド
            features = '- すべての機能が利用可能\n- 500文字までの読み上げ\n- 音声履歴の保存と検索\n- 履歴クリア機能\n- 優先サポート';
            break;
        case SubscriptionTier.PRO:
            subscriptionName = 'Pro';
            color = 0xC0C0C0; // シルバー
            features = '- 300文字までの読み上げ\n- 音声履歴の保存と検索';
            break;
        default:
            subscriptionName = '無料版';
            color = 0x808080; // グレー
            features = '- 200文字までの読み上げ\n- 基本的な読み上げ機能';
    }
        
    const embed = new EmbedBuilder()
        .setTitle('サブスクリプション情報')
        .setDescription(`このサーバーは現在 **${subscriptionName}** を利用中です。`)
        .setColor(color)
        .addFields({ name: '利用可能な機能', value: features });
        
    // BOT作者のギルドの場合は特別メッセージを表示
    if (info.isOwnerGuild) {
        embed.addFields({ name: '特記事項', value: 'このサーバーはBOT作者のサーバーのため、自動的にPremium特権が付与されています。' });
    }
    // 期限がある場合は表示
    else if (info.expiresAt) {
        embed.addFields({ name: '有効期限', value: `${(info.expiresAt as Date).toLocaleDateString()} (残り ${info.daysLeft} 日)` });
    }
        
    await interaction.reply({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}

function getFeatureLimitInfo(tier: SubscriptionTier): string {
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return '読み上げ: 800文字まで / すべての機能が利用可能';
        case SubscriptionTier.PRO:
            return '読み上げ: 400文字まで / 高度な音声設定が利用可能';
        default:
            return '読み上げ: 200文字まで / 基本機能のみ利用可能';
    }
}
