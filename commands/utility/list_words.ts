import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder, MessageFlags, CommandInteraction } from 'discord.js';
import { guildDictionary } from '../../utils/dictionaries'; // Adjust the import path as necessary

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list_words')
        .setDescription('全ての登録されている単語を表示します'),
    async execute(interaction: CommandInteraction) {
        const guildId = interaction.guildId!.toString();
        const words = guildDictionary[guildId] || {};

        if (Object.keys(words).length === 0) {
            await interaction.reply({ content: "辞書に単語が登録されていません。", flags: MessageFlags.Ephemeral });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("辞書の単語一覧")
            .setDescription(Object.entries(words).map(([word, details]) => {
                const { pronunciation, accentType, wordType } = details as { pronunciation: string, accentType: number, wordType: string };
                return `${word}: ${pronunciation}, アクセント: ${accentType}, 品詞: ${wordType}`;
            }).join("\n"));

        await interaction.reply({ embeds: [embed] });
    }
};