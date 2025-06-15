import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine'; // Adjust the import path as necessary

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_speed')
        .setDescription('TTSエンジンの話速を設定します')
        .addNumberOption(option =>
            option.setName('speed')
                .setDescription('設定する話速レベル (0.5から2.0)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const speed = options.getNumber('speed', true);

        if (speed >= 0.5 && speed <= 2.0) {
            voiceSettings.speed[interaction.user.id] = speed;
            await interaction.reply(`話速を ${speed} に設定しました。`);
        } else {
            await interaction.reply({ content: '話速は 0.5 から 2.0 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    }
};