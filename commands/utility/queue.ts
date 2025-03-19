import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { getQueueStatus, clearQueue } from '../../utils/VoiceQueue';

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
            await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
            return;
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'status') {
            const status = getQueueStatus(interaction.guildId);
            await interaction.reply({
                content: `現在のキュー状態:\n▶️ 待機中メッセージ数: ${status.length}\n▶️ 処理中: ${status.processing ? 'はい' : 'いいえ'}`,
                flags: MessageFlags.Ephemeral
            });
        }
        else if (subcommand === 'clear') {
            const clearedCount = clearQueue(interaction.guildId);
            await interaction.reply({
                content: `読み上げキューをクリアしました。${clearedCount}件のメッセージが削除されました。`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
