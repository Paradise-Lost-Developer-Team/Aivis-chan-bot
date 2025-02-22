import { CommandInteraction, MessageFlags } from 'discord.js';
import { voiceSettings } from 'set_voiceSettings'; // Adjust the import path as necessary

module.exports = {
    data: {
        name: "set_pitch",
        description: "TTSエンジンの音高を設定します",
        options: [
            {
                name: "pitch",
                type: "NUMBER",
                description: "設定する音高レベル (-1.0から1.0)",
                required: true
            }
        ]
    }, 
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "set_pitch") {
            const pitch = interaction.options.get("pitch")?.value as number;
            if (pitch !== null && pitch >= -1.0 && pitch <= 1.0) {
                voiceSettings.pitch[interaction.guildId!] = pitch;
                await interaction.reply(`音高を ${pitch} に設定しました。`);
            } else {
                await interaction.reply({ content: "無効な音高値です。-1.0から1.0の間で設定してください。", flags: MessageFlags.Ephemeral });
            }
        }
    }
};