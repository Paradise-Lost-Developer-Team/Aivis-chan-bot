import axios from 'axios';
import { CommandInteractionOptionResolver, MessageFlags, CommandInteraction } from 'discord.js';
import { fetchAllUUIDs, updateGuildDictionary } from 'dictionaries';

module.exports = {
    name: 'edit_word',
    description: 'Edit a word in the dictionary',
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "edit_word") {
            const word = (interaction.options as CommandInteractionOptionResolver).getString("word")!;
            const newPronunciation = (interaction.options as CommandInteractionOptionResolver).getString("new_pronunciation")!;
            const accentType = (interaction.options as CommandInteractionOptionResolver).getNumber("accent_type")!;
            const wordType = (interaction.options as CommandInteractionOptionResolver).getString("word_type")!;

            const uuidDict = await fetchAllUUIDs();
            const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
            const editUrl = `http://localhost:10101/user_dict_word/${uuid}?surface=${word}&pronunciation=${newPronunciation}&accent_type=${accentType}&word_type=${wordType}`;

            if (uuid) {
                const response = await axios.put(editUrl);
                if (response.status === 204) {
                    const details = { pronunciation: newPronunciation, accentType, wordType, uuid };
                    updateGuildDictionary(interaction.guildId!, word, details);
                    await interaction.reply(`単語 '${word}' の発音を '${newPronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に編集しました。`);
                } else {
                    await interaction.reply({ content: `単語 '${word}' の編集に失敗しました。`, flags: MessageFlags.Ephemeral });
                }
            } else {
                await interaction.reply({ content: `単語 '${word}' のUUIDが見つかりませんでした。`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};