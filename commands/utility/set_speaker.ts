import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, CommandInteractionOptionResolver } from 'discord.js';
import { getSpeakerOptions, speakers, currentSpeaker } from '../../TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_speaker')
        .setDescription('話者を設定します')
        .addStringOption((option) =>
            option.setName('speaker')
                .setDescription('設定する話者')
                .setRequired(true)
                .setChoices(getSpeakerOptions())
        ),
    async execute(interaction: CommandInteraction) {
        if (speakers.length === 0) {
            await interaction.reply("スピーカー情報が読み込まれていません。");
            return;
        }

        const options = interaction.options as CommandInteractionOptionResolver;
        const speaker = options.getNumber('speaker', true);
        currentSpeaker[interaction.guildId!] = speaker;


    }
};