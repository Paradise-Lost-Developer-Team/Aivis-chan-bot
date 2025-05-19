import { SlashCommandBuilder } from '@discordjs/builders';
import { MessageFlags, CommandInteraction, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../utils/TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_intonation')
        .setDescription('TTSエンジンの感情表現の強さを設定します')
        .addNumberOption(option =>
            option.setName('intonation')
                .setDescription('設定する感情表現強度レベル (0.0から2.0)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const intonation = options.getNumber('intonation');

        if (intonation !== null && intonation >= 0.0 && intonation <= 2.0) {
            voiceSettings.intonation[interaction.user.id] = intonation;
            await interaction.reply(`感情表現強度を ${intonation} に設定しました。`);
        } else {
            await interaction.reply({ content: '感情表現強度は 0.0 から 2.0 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    }
};