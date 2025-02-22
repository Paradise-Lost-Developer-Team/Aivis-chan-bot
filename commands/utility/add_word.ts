import { SlashCommandBuilder } from '@discordjs/builders';
import { updateGuildDictionary, wordTypeChoices } from '../../dictionaries';
import { CommandInteraction, CommandInteractionOptionResolver, MessageFlags } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add_word')
        .setDescription('辞書に単語を追加します')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('追加する単語')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('pronunciation')
                .setDescription('発音')
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
        const pronunciation = options.getString('pronunciation', true);
        const accentType = options.getNumber('accent_type', true);
        const wordType = options.getString('word_type', true);

        const addUrl = `http://localhost:10101/user_dict_word?surface=${word}&pronunciation=${pronunciation}&accent_type=${accentType}&word_type=${wordType}`;
        const response = await fetch(addUrl);

        // 辞書に単語を追加する処理をここに記述
        if (response.status === 200) {
            const details = { pronunciation, accentType, wordType };
            updateGuildDictionary(interaction.guildId!, word, details);
            await interaction.reply(`単語 '${word}' の発音を '${pronunciation}', アクセント '${accentType}', 品詞 '${wordType}' で追加しました。`);
        } else {
                await interaction.reply({ content: '単語の追加に失敗しました。', flags: MessageFlags.Ephemeral });
            }
        },
    };