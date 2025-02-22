import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { updateGuildDictionary } from '../../dictionaries'; // 相対パスを修正

module.exports = {
    data: {
        name: "add_word",
        description: "辞書に単語を追加します",
        options: [
            {
                name: "word",
                type: "STRING",
                description: "追加する単語",
                required: true
            },
            {
                name: "pronunciation",
                type: "STRING",
                description: "発音",
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
            const pronunciation = options.getString("pronunciation")!;
            const accentType = options.getNumber("accent_type")!;
            const wordType = options.getString("word_type")!;

            updateGuildDictionary(interaction.guildId!, word, { pronunciation, accentType, wordType });
            await interaction.reply(`単語 '${word}' を辞書に追加しました。`);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: `単語の追加に失敗しました。`, flags: MessageFlags.Ephemeral });
        }
    }
};