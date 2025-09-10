import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, CommandInteraction, CommandInteractionOptionResolver, CacheType } from 'discord.js';
import { SubscriptionType, getSubscription, setSubscription, SubscriptionBenefits, getGuildSubscriptionTier, applySubscriptionFromPatreon } from '../../utils/subscription';
import patreonIntegration from '../../utils/patreonIntegration';
import path from 'path';
import fs from 'fs';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

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
    );

// 型をCommandInteractionに変更
export async function execute(interaction: CommandInteraction) {
    const options = (interaction as any).options as CommandInteractionOptionResolver<CacheType>;
    const subcommand = options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('エラー')
                    .setDescription('このコマンドはサーバー内でのみ使用できます。')
                    .setColor(0xff0000)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    if (subcommand === 'info') {
        let subscriptionType = await getGuildSubscriptionTier(guildId) || getSubscription(guildId);
        if (!subscriptionType) subscriptionType = SubscriptionType.FREE;
        const benefits = SubscriptionBenefits[subscriptionType];
        const subscriptionNames = {
            [SubscriptionType.FREE]: '無料プラン',
            [SubscriptionType.PRO]: 'Proプラン',
            [SubscriptionType.PREMIUM]: 'Premiumプラン'
        };
        const embed = addCommonFooter(
            new EmbedBuilder()
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
                )
        );
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
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, components: [getCommonLinksRow()] });
    } else if (subcommand === 'set') {
        if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('権限エラー')
                        .setDescription('このコマンドは管理者のみ使用できます。')
                        .setColor(0xff0000)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
        }
        const type = options.getString('type') as SubscriptionType || SubscriptionType.FREE;
        const days = options.getInteger('days') || 0;
        setSubscription(guildId, type, days);
        const planNames = {
            [SubscriptionType.FREE]: '無料プラン',
            [SubscriptionType.PRO]: 'Proプラン', 
            [SubscriptionType.PREMIUM]: 'Premiumプラン'
        };
        await interaction.reply({ 
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('サブスクリプション設定')
                    .setDescription(`サブスクリプションを **${planNames[type]}** に設定しました。期間: ${days}日間`)
                    .setColor(0x00bfff)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
    } else if (subcommand === 'status') {
        // show effective subscription for this guild; if patreon linked for bot user, apply it
        const current = await getGuildSubscriptionTier(guildId);
        const subscriptionNames = {
            [SubscriptionType.FREE]: '無料プラン',
            [SubscriptionType.PRO]: 'Proプラン',
            [SubscriptionType.PREMIUM]: 'Premiumプラン'
        };

        // Try to auto-apply Patreon if the guild owner is linked and has a Patreon
        // We will check the guild owner and bot link: if owner has patreon linked and it's paid, apply
        try {
            const guild = (interaction.client as any).guilds.cache.get(guildId!);
            const ownerId = guild?.ownerId;
            if (ownerId) {
                const tier = await patreonIntegration.getUserTier(ownerId);
                if (tier === SubscriptionType.PRO || tier === SubscriptionType.PREMIUM) {
                    const applied = await applySubscriptionFromPatreon(ownerId, guildId!, 30);
                    if (applied) {
                        const embed = addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('サブスクリプション適用')
                                .setDescription(`Patreon の連携を確認しました。ギルドに **${subscriptionNames[tier]}** を適用しました。`)
                                .setColor(tier === SubscriptionType.PREMIUM ? 0xFFD700 : 0x00AAFF)
                        );
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, components: [getCommonLinksRow()] });
                        return;
                    }
                }
            }
        } catch (e) {
            console.log('subscription status patreon check failed:', e);
        }

        const embed = addCommonFooter(
            new EmbedBuilder()
                .setTitle('サブスクリプションステータス')
                .setDescription(`現在のプラン: **${subscriptionNames[current]}**`)
                .setColor(current === SubscriptionType.FREE ? 0x808080 : current === SubscriptionType.PRO ? 0x00AAFF : 0xFFD700)
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, components: [getCommonLinksRow()] });
        return;
    }
}
