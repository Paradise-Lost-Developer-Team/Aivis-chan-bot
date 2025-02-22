import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, CommandInteraction, StringSelectMenuBuilder, Interaction, Events } from 'discord.js';
import { speakers } from '../../TTS-Engine';
import { client } from '../../index';
import { currentSpeaker } from '../../TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName("set_speaker")
        .setDescription("スピーカーを設定する"),
    async execute(interaction: CommandInteraction) {
        if (speakers.length === 0) {
            await interaction.reply("スピーカー情報が読み込まれていません。");
            return;
        }
        const options = speakers.map(speaker => ({
            label: speaker.name,
            value: speaker.id.toString()
        }));
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

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu()) 
        return;
    
    if (interaction.customId === 'select_speaker') {
        const selectedSpeakerId = interaction.values[0];
        currentSpeaker[interaction.guildId!] = parseInt(selectedSpeakerId);
        await interaction.update({ content: `話者をID ${selectedSpeakerId} に設定しました。`, components: [] });
    }
})