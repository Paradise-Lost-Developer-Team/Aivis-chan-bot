import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../set_voiceSettings'; // Adjust the import path as necessary

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_volume')
        .setDescription('TTSエンジンの音量を設定します')
        .addNumberOption(option =>
            option.setName('volume')
                .setDescription('設定する音量レベル (0.0から2.0)')
                .setRequired(true)),
    async execute(interaction: CommandInteraction) {
        const options = interaction.options as CommandInteractionOptionResolver;
        const volume = options.getNumber('volume', true);

        if (volume >= 0.0 && volume <= 2.0) {
            voiceSettings.volume[interaction.guildId!] = volume;
            await interaction.reply(`音量を ${volume} に設定しました。`);
        } else {
            await interaction.reply({ content: '音量は 0.0 から 2.0 の間でなければなりません。', flags: MessageFlags.Ephemeral });
        }
    }
};