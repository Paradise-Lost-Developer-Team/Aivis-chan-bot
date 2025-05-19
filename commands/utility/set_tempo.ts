import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_tempo')
        .setDescription('TTSエンジンのテンポを設定します')
        .addNumberOption(option =>
            option.setName('tempo')
                .setDescription('設定するテンポレベル (0.0から2.0)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const tempo = options.getNumber('tempo', true);
        if (tempo >= 0.0 && tempo <= 2.0) {
            voiceSettings.tempo[interaction.user.id] = tempo;
            await interaction.reply(`テンポを ${tempo} に設定しました。`);
        } else {
            await interaction.reply({ content: 'テンポは 0.0 から 2.0 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    }
};