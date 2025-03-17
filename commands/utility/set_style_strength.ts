import { SlashCommandBuilder } from '@discordjs/builders';
import { MessageFlags, CommandInteraction, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_style_strength')
        .setDescription('TTSエンジンのスタイル強度を設定します')
        .addNumberOption(option =>
            option.setName('style_strength')
                .setDescription('設定するスタイル強度レベル (0.0から2.0)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const styleStrength = options.getNumber('style_strength');

        if (styleStrength !== null && styleStrength >= 0.0 && styleStrength <= 2.0) {
            voiceSettings.style_strength[interaction.guildId!] = styleStrength;
            await interaction.reply(`スタイル強度を ${styleStrength} に設定しました。`);
        } else {
            await interaction.reply({ content: 'スタイル強度は 0.0 から 2.0 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    }
};