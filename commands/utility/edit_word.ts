import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, CommandInteractionOptionResolver } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit_word')
        .setDescription('辞書の単語を編集します')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('編集する単語')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('new_pronunciation')
                .setDescription('新しい発音')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('accent_type')
                .setDescription('アクセントタイプ')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('word_type')
                .setDescription('単語の種類')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const word = options.getString('word', true);
        const newPronunciation = options.getString('new_pronunciation', true);
        const accentType = options.getNumber('accent_type', true);
        const wordType = options.getString('word_type', true);

        // 辞書の単語を編集する処理をここに記述
        await interaction.reply(`単語 '${word}' を編集しました。`);
    },
};