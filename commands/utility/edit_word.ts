import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { updateGuildDictionary } from '../../dictionaries'; // 相対パスを修正

module.exports = {
    data: {
        name: "edit_word",
        description: "辞書の単語を編集します",
        options: [
            {
                name: "word",
                type: "STRING",
                description: "編集する単語",
                required: true
            },
            {
                name: "new_pronunciation",
                type: "STRING",
                description: "新しい発音",
                required: true
            },
            {
                name: "accent_type",
                type: "NUMBER",
                description: "アクセントタイプ",
                required: true
            },
            {
                name: "word_type",
                type: "STRING",
                description: "単語の種類",
                required: true
            }
        ]
    },
    async execute(interaction: CommandInteraction) {
        try {
            const options = interaction.options as CommandInteractionOptionResolver;
            const word = options.getString("word")!;
            const newPronunciation = options.getString("new_pronunciation")!;
            const accentType = options.getNumber("accent_type")!;
            const wordType = options.getString("word_type")!;

            updateGuildDictionary(interaction.guildId!, word, { pronunciation: newPronunciation, accentType, wordType });
            await interaction.reply(`単語 '${word}' を編集しました。`);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '単語の編集に失敗しました。', flags: MessageFlags.Ephemeral });
        }
    }
};