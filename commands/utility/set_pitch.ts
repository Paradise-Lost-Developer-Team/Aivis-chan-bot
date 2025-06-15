import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_pitch')
        .setDescription('TTSエンジンの音高を設定します')
        .addNumberOption(option =>
            option.setName('pitch')
                .setDescription('設定する音高レベル (-0.15から0.15)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const pitch = options.getNumber('pitch', true);
        if (pitch >= -0.15 && pitch <= 0.15) {
            voiceSettings.pitch[interaction.user.id] = pitch;
            await interaction.reply(`音高を ${pitch} に設定しました。`);
        } else {
            await interaction.reply({ content: '音高は -0.15 から 0.15 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    },
};