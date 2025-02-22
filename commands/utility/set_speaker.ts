import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, StringSelectMenuBuilder, CommandInteraction, StringSelectMenuInteraction } from 'discord.js';
import { getSpeakerOptions, speakers } from '../../set_voiceSettings'

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_speaker')
        .setDescription('話者を設定します')
        .addStringOption(option =>
            option.setName('speaker')
                .setDescription('設定する話者')
                .setRequired(true)
                .addChoices(...getSpeakerOptions())),
    async execute(interaction: CommandInteraction) {
        if (speakers.length === 0) {
            await interaction.reply("スピーカー情報が読み込まれていません。");
            return;
        }
        const options = getSpeakerOptions();
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_speaker')
                    .setPlaceholder('話者を選択してください')
                    .addOptions(options)
            );
        await interaction.reply({ content: "話者を選択してください:", components: [row] });
    }
};