import { MessageFlags, CommandInteraction } from 'discord.js';
import { voiceSettings } from 'set_voiceSettings';

module.exports = {
    data: {
        name: "set_style_strength",
        description: "TTSエンジンのスタイル強度を設定します",
        options: [
            {
                name: "style_strength",
                type: "NUMBER",
                description: "設定するスタイル強度レベル (0.0から2.0)",
                required: true
            }
        ]
    },
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "set_style_strength") {
            const styleStrength = interaction.options.get("style_strength")?.value as number | undefined;
            if (typeof styleStrength === 'number' && styleStrength >= 0.0 && styleStrength <= 2.0) {
                voiceSettings.styleStrength[interaction.guildId!] = styleStrength;
                await interaction.reply(`スタイル強度を ${styleStrength} に設定しました。`);
            } else {
                await interaction.reply({ content: "無効なスタイル強度値です。0.0から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
            }
        }
    }
};