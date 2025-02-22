import { CommandInteraction, MessageFlags } from 'discord.js';
import { voiceSettings } from '../../set_voiceSettings'; // Adjust the import path as necessary

module.exports = {
    data: {
        name: "set_volume",
        description: "TTSエンジンの音量を設定します",
        options: [
            {
                name: "volume",
                type: "NUMBER",
                description: "設定する音量レベル (0.0から2.0)",
                required: true
            }
        ]
    },
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "set_volume") {
            const volume = interaction.options.get("volume")?.value as number;
            if (volume !== null && volume >= 0.0 && volume <= 2.0) {
                voiceSettings.volume[interaction.guildId!] = volume;
                await interaction.reply(`音量を ${volume} に設定しました。`);
            } else {
                await interaction.reply({ content: "無効な音量値です。0.0から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
            }
        }
    }
};