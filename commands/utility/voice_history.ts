import { SlashCommandBuilder } from '@discordjs/builders';
import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ButtonInteraction,
    MessageFlags
} from 'discord.js';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from '../../utils/subscription';
import { 
    getVoiceHistory, 
    searchVoiceHistory, 
    getUserVoiceHistory, 
    VoiceHistoryItem, 
    clearVoiceHistory,
    getVoiceHistoryByTimeRange 
} from '../../utils/voiceHistory';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicehistory')
        .setDescription('Pro版限定: 読み上げ履歴を表示します')
        .addSubcommand(subcommand =>
            subcommand.setName('list')
            .setDescription('最近の読み上げ履歴を表示します')
            .addIntegerOption(option =>
                option.setName('count')
                .setDescription('表示する件数 (デフォルト: 10)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(50)))
        .addSubcommand(subcommand =>
            subcommand.setName('search')
            .setDescription('読み上げ履歴を検索します')
            .addStringOption(option =>
                option.setName('query')
                .setDescription('検索キーワード')
                .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('user')
            .setDescription('特定ユーザーの読み上げ履歴を表示します')
            .addUserOption(option =>
                option.setName('target')
                .setDescription('対象ユーザー')
                .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('clear')
            .setDescription('読み上げ履歴を削除します (Premium版のみ)')),

    async execute(interaction: ChatInputCommandInteraction) {
        const guildId = interaction.guildId!;
        
        // Pro版以上か確認
        if (!isProFeatureAvailable(guildId, 'voice-history')) {
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('Pro版限定')
                        .setDescription('このコマンドはPro版限定機能です。Pro版へのアップグレードについては `/subscription purchase` で確認できます。')
                        .setColor(0xffa500)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
            return;
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        try {
            if (subcommand === 'list') {
                await handleListCommand(interaction);
            } else if (subcommand === 'search') {
                await handleSearchCommand(interaction);
            } else if (subcommand === 'user') {
                await handleUserCommand(interaction);
            } else if (subcommand === 'clear') {
                await handleClearCommand(interaction, guildId);
            }
        } catch (error) {
            console.error('履歴コマンド実行エラー:', error);
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription('履歴の取得中にエラーが発生しました。')
                        .setColor(0xff0000)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
        }
    },
};

// リスト表示コマンド
async function handleListCommand(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const count = interaction.options.getInteger('count') || 10;
    
    const history = getVoiceHistory(guildId);
    if (history.length === 0) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('履歴なし')
                    .setDescription('読み上げ履歴がありません。')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    
    // 最新の履歴を取得
    const recentHistory = history.slice(-count);
    
    const embed = createHistoryEmbed('最近の読み上げ履歴', recentHistory);
    
    // ページネーションボタンを作成 (Premium版のみ)
    let components = [];
    if ((await isPremiumFeatureAvailable(guildId, 'voice-history')) && history.length > count) {
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('history_prev')
                    .setLabel('前のページ')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('history_next')
                    .setLabel('次のページ')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(history.length <= count)
            );
        components.push(row);
    }
    
    await interaction.reply({
        embeds: [addCommonFooter(embed)],
        components,
        flags: MessageFlags.Ephemeral
    });
}

// 検索コマンド
async function handleSearchCommand(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const query = interaction.options.getString('query', true);
    
    const searchResults = searchVoiceHistory(guildId, query);
    
    if (searchResults.length === 0) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('検索結果なし')
                    .setDescription(`「${query}」に一致する履歴が見つかりませんでした。`)
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    
    // 最大10件のみ表示
    const displayResults = searchResults.slice(-10);
    const embed = createHistoryEmbed(`「${query}」の検索結果 (${searchResults.length}件中${displayResults.length}件表示)`, displayResults);
    
    await interaction.reply({
        embeds: [addCommonFooter(embed)],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

// ユーザー履歴コマンド
async function handleUserCommand(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const targetUser = interaction.options.getUser('target', true);
    
    const userHistory = getUserVoiceHistory(guildId, targetUser.id);
    
    if (userHistory.length === 0) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('履歴なし')
                    .setDescription(`${targetUser.username} さんの読み上げ履歴はありません。`)
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    
    // 最大10件のみ表示
    const displayResults = userHistory.slice(-10);
    const embed = createHistoryEmbed(
        `${targetUser.username} さんの読み上げ履歴 (${userHistory.length}件中${displayResults.length}件表示)`,
        displayResults
    );
    
    await interaction.reply({
        embeds: [addCommonFooter(embed)],
        flags: MessageFlags.Ephemeral,
        components: [getCommonLinksRow()]
    });
}

// 履歴クリアコマンド
async function handleClearCommand(interaction: ChatInputCommandInteraction, guildId: string) {
    // Premium版限定機能
    if (!(await isPremiumFeatureAvailable(guildId, 'voice-history'))) {
        await interaction.reply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('Premium限定')
                    .setDescription('履歴のクリアはPremium版限定機能です。Premium版へのアップグレードについては `/subscription purchase` で確認できます。')
                    .setColor(0xffa500)
            )],
            flags: MessageFlags.Ephemeral,
            components: [getCommonLinksRow()]
        });
        return;
    }
    
    const confirmRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('history_clear_confirm')
                .setLabel('履歴を削除する')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('history_clear_cancel')
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Secondary)
        );
    
    const response = await interaction.reply({
        content: '⚠️ **注意**: このサーバーの読み上げ履歴をすべて削除します。この操作は元に戻せません。続行しますか？',
        components: [confirmRow],
        flags: MessageFlags.Ephemeral
    });
    
    try {
        // 確認ボタンの応答を待つ
        const confirmation = await response.awaitMessageComponent({ time: 60_000 });
        
        if (confirmation.customId === 'history_clear_confirm') {
            const success = clearVoiceHistory(guildId);
            
            if (success) {
                await confirmation.update({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('削除完了')
                            .setDescription('✅ 履歴を削除しました。')
                            .setColor(0x00bfff)
                    )],
                    components: []
                });
            } else {
                await confirmation.update({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('削除失敗')
                            .setDescription('❌ 履歴の削除中にエラーが発生しました。')
                            .setColor(0xff0000)
                    )],
                    components: []
                });
            }
        } else {
            await confirmation.update({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('キャンセル')
                        .setDescription('操作をキャンセルしました。')
                        .setColor(0xffa500)
                )],
                components: []
            });
        }
    } catch (error) {
        // タイムアウト
        await interaction.editReply({
            embeds: [addCommonFooter(
                new EmbedBuilder()
                    .setTitle('タイムアウト')
                    .setDescription('操作がタイムアウトしました。')
                    .setColor(0xffa500)
            )],
            components: []
        });
    }
}

// 履歴表示用のEmbed作成
function createHistoryEmbed(title: string, history: VoiceHistoryItem[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor('#00AAFF')
        .setTimestamp();
    
    if (history.length === 0) {
        embed.setDescription('表示する履歴がありません。');
        return embed;
    }
    
    // 履歴を降順（新しい順）にソート
    const sortedHistory = [...history].sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    
    // 各履歴アイテムをフィールドとして追加
    sortedHistory.forEach((item, index) => {
        const date = new Date(item.timestamp);
        const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        embed.addFields({
            name: `${index + 1}. ${item.username} (${formattedDate})`, 
            value: item.text.length > 100 ? item.text.substring(0, 97) + '...' : item.text
        });
    });
    
    return embed;
}

// ページネーション処理用のハンドラ（Premium版用）
export async function handleHistoryPagination(interaction: ButtonInteraction, history: VoiceHistoryItem[], currentPage: number, itemsPerPage: number): Promise<void> {
    const totalPages = Math.ceil(history.length / itemsPerPage);
    let newPage = currentPage;
    
    if (interaction.customId === 'history_next') {
        newPage++;
    } else if (interaction.customId === 'history_prev') {
        newPage--;
    }
    
    // ページ範囲の検証
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    
    // 現在のページのアイテムを取得
    const startIdx = (newPage - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, history.length);
    const pageItems = history.slice(startIdx, endIdx);
    
    // 新しいEmbedを作成
    const embed = createHistoryEmbed(`読み上げ履歴 (${newPage}/${totalPages}ページ)`, pageItems);
    
    // ボタンの更新
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('history_prev')
                .setLabel('前のページ')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(newPage <= 1),
            new ButtonBuilder()
                .setCustomId('history_next')
                .setLabel('次のページ')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(newPage >= totalPages)
        );
    
    // 応答を更新
    await interaction.update({
        embeds: [embed],
        components: [row]
    });
}
