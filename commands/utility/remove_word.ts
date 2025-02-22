import { CommandInteraction, CommandInteractionOptionResolver, MessageFlags } from 'discord.js';
import axios from 'axios';
import { fetchAllUUIDs, guildDictionary, saveToDictionaryFile } from '../../dictionaries'; // Adjust the import paths as necessary

module.exports = {
    name: 'remove_word',
    description: 'Remove a word from the dictionary',
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "remove_word") {
            const word = (interaction.options as CommandInteractionOptionResolver).getString("word")!;
            const uuidDict = await fetchAllUUIDs();
            const uuid = Object.keys(uuidDict).find(key => uuidDict[key].surface === word);
            const removeUrl = `http://localhost:10101/user_dict_word/${uuid}`;
            if (uuid) {
                const response = await axios.delete(removeUrl);
                if (response.status === 200) {
                    const guildIdStr = interaction.guildId!.toString();
                    delete guildDictionary[guildIdStr][word];
                    saveToDictionaryFile();
                    await interaction.reply(`単語 '${word}' を辞書から削除しました。`);
                } else {
                    await interaction.reply({ content: `単語 '${word}' の削除に失敗しました。`, flags: MessageFlags.Ephemeral });
                }
            } else {
                await interaction.reply({ content: `単語 '${word}' のUUIDが見つかりませんでした。`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};
