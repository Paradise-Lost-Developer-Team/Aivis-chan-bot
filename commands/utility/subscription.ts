import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { SubscriptionType, getSubscription, setSubscription, SubscriptionBenefits } from '../../utils/subscription';

export default {
    data: new SlashCommandBuilder()
        .setName('subscription')
        .setDescription('サブスクリプション関連のコマンド')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('現在のサブスクリプション情報を表示します'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('サブスクリプションを設定します (管理者のみ)')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('サブスクリプションタイプ')
                        .setRequired(true)
                        .addChoices(
                            { name: '無料', value: 'free' },
                            { name: 'Pro', value: 'pro' },
                            { name: 'Premium', value: 'premium' }
                        ))
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('期間（日数）')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(365)))
        .setDMPermission(false),

    async execute(interaction: { options: { getSubcommand: () => any; getString: (arg0: string) => SubscriptionType; getInteger: (arg0: string) => any; }; guildId: any; reply: (arg0: { embeds?: EmbedBuilder[]; ephemeral: boolean; content?: string; }) => any; memberPermissions: { has: (arg0: bigint) => any; }; }) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'info') {
            const guildId = interaction.guildId;
            const subscriptionType = getSubscription(guildId);
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
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
        } else if (subcommand === 'set') {
            // 管理者権限確認
            if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ 
                    content: 'このコマンドは管理者のみ使用できます。',
                    ephemeral: true 
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
                ephemeral: true 
            });
        }
    },
};
