import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { getQueueStatus, clearQueue } from '../../utils/VoiceQueue';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('読み上げキューを管理します')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('現在のキュー状態を確認します'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('読み上げキューをクリアします')),
    
    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) {
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
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'status') {
            const status = getQueueStatus(interaction.guildId);
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('キュー状態')
                        .setDescription(`▶️ 待機中メッセージ数: ${status.length}\n▶️ 処理中: ${status.processing ? 'はい' : 'いいえ'}`)
                        .setColor(0x00bfff)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
        }
        else if (subcommand === 'clear') {
            const clearedCount = clearQueue(interaction.guildId);
            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('キュークリア')
                        .setDescription(`読み上げキューをクリアしました。${clearedCount}件のメッセージが削除されました。`)
                        .setColor(0x00bfff)
                )],
                flags: MessageFlags.Ephemeral,
                components: [getCommonLinksRow()]
            });
        }
    }
};
