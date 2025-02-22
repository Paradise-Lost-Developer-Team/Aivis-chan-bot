import { CommandInteraction, MessageFlags } from 'discord.js';
import { voiceSettings } from 'set_voiceSettings'; // Adjust the import path as necessary

module.exports = {
    data: {
        name: "set_speed",
        description: "TTSエンジンの話速を設定します",
        options: [
            {
                name: "speed",
                type: "NUMBER",
                description: "設定する話速レベル (0.0から2.0)",
                required: true
            }
        ]
    },
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "set_speed") {
            const speed = interaction.options.get("speed")?.value as number | undefined;
            if (typeof speed === 'number' && speed >= 0.0 && speed <= 2.0) {
                voiceSettings.speed[interaction.guildId!] = speed;
                await interaction.reply(`話速を ${speed} に設定しました。`);
            } else {
                await interaction.reply({ content: "無効な話速値です。0.0から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
            }
        }
    }
};