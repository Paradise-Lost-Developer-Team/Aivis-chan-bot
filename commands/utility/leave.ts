import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, MessageFlags } from 'discord.js';
import { voiceClients, deleteJoinChannelsConfig, loadJoinChannels } from '../../TTS-Engine'; // Adjust the path as necessary

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('BOTをチャンネルから退出します'),
    async execute(interaction: CommandInteraction) {
        const guildId = interaction.guildId!;
        const voiceClient = voiceClients[guildId];

        if (!voiceClient) {
            await interaction.reply({ content: "現在、ボイスチャンネルに接続していません。", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            await voiceClient.disconnect();
            delete voiceClients[guildId];
            deleteJoinChannelsConfig(guildId);
            await interaction.reply("ボイスチャンネルから切断しました。");
            loadJoinChannels();
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: "ボイスチャンネルからの切断に失敗しました。", flags: MessageFlags.Ephemeral });
        }
    }
    }