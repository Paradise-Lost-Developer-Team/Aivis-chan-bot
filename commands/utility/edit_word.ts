import { SlashCommandBuilder } from '@discordjs/builders';
import { fetchAllUUIDs, updateGuildDictionary, wordTypeChoices } from '../../dictionaries';
import { CommandInteraction, CommandInteractionOptionResolver, MessageFlags } from 'discord.js';

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
                .setRequired(true)
                .setChoices(wordTypeChoices)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const word = options.getString('word', true);
        const newPronunciation = options.getString('new_pronunciation', true);
        const accentType = options.getNumber('accent_type', true);
        const wordType = options.getString('word_type', true);


        const uuidDict = await fetchAllUUIDs();
        const uuid = Object.keys(uuidDict).find(key => uuidDict[key] === word);
        const editUrl = `http://localhost:10101/user_dict_word/${uuid}?surface=${word}&pronunciation=${newPronunciation}&accent_type=${accentType}&word_type=${wordType}`;
        if (uuid) {
            const response = await fetch(editUrl, { method: 'PUT' });
            // 辞書の単語を編集する処理をここに記述
            if (response.status === 204) {
                const details = { pronunciation: newPronunciation, accentType, wordType };
                updateGuildDictionary(interaction.guildId!, word, details);
                await interaction.reply(`単語 '${word}' の発音を '${newPronunciation}', アクセント '${accentType}', 品詞 '${wordType}' に編集しました。`);
            } else {
                await interaction.reply({ content: '単語の編集に失敗しました。', flags: MessageFlags.Ephemeral });
            }
        }
    },
};