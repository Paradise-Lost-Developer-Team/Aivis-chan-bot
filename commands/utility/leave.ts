import { CommandInteraction } from 'discord.js';
import { voiceClients } from 'TTS-Engine'; // Adjust the path as necessary

export async function LeaveCommand(interaction: CommandInteraction) {
    const commandName = interaction.commandName;

    if (commandName === "leave") {
        const guildId = interaction.guildId!;
        const voiceClient = voiceClients[guildId];

        if (!voiceClient) {
            await interaction.reply("現在、ボイスチャンネルに接続していません。");
            return;
        }

        try {
            await voiceClient.disconnect();
            delete voiceClients[guildId];
            await interaction.reply("ボイスチャンネルから切断しました。");
        } catch (error) {
            console.error(error);
            await interaction.reply("ボイスチャンネルからの切断に失敗しました。");
        }
    }
}