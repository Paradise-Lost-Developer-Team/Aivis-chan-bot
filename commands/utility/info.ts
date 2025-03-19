import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getSubscriptionInfo, SubscriptionTier } from '../../utils/subscription';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('subscription')
        .setDescription('サブスクリプション情報の表示と管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('現在のサブスクリプション情報を表示します')),
    
    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) {
            await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
            return;
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'info') {
            const info = getSubscriptionInfo(interaction.guildId);
            
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
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
