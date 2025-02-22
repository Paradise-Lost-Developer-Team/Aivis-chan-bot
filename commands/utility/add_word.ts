import axios from 'axios';
import { CommandInteraction, CommandInteractionOptionResolver, MessageFlags } from 'discord.js';
import { updateGuildDictionary } from 'dictionaries';

module.exports = {
    name: 'add_word',
    description: 'Add a word to the dictionary',
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "add_word") {
            const word = (interaction.options as CommandInteractionOptionResolver).getString("word")!;
            const pronunciation = (interaction.options as CommandInteractionOptionResolver).getString("pronunciation")!;
            const accentType = (interaction.options as CommandInteractionOptionResolver).getNumber("accent_type")!;
            const wordType = (interaction.options as CommandInteractionOptionResolver).getString("word_type")!;

            const addUrl = `http://localhost:10101/user_dict_word?surface=${word}&pronunciation=${pronunciation}&accent_type=${accentType}&word_type=${wordType}`;
            const response = await axios.post(addUrl);

            if (response.status === 200) {
                const details = { pronunciation, accentType, wordType };
                updateGuildDictionary(interaction.guildId!, word, details);
                await interaction.reply(`単語 '${word}' の発音を '${pronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に登録しました。`);
            } else {
                await interaction.reply({ content: `単語 '${word}' の登録に失敗しました。`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};