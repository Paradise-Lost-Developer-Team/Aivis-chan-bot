import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_pitch')
        .setDescription('TTSエンジンの音高を設定します')
        .addNumberOption(option =>
            option.setName('pitch')
                .setDescription('設定する音高レベル (-1.0から1.0)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const pitch = options.getNumber('pitch', true);
        if (pitch >= -1.0 && pitch <= 1.0) {
            
            // 音高を設定する処理をここに記述
            voiceSettings.pitch[interaction.guildId!] = pitch;
            await interaction.reply(`音高を ${pitch} に設定しました。`);
        } else {
            await interaction.reply({ content: '音高は -1.0 から 1.0 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    },
};