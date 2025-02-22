import { CommandInteraction, MessageFlags, CommandInteractionOptionResolver } from 'discord.js';
import { voiceSettings } from '../../set_voiceSettings'; // 相対パスを修正

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
        const pitch = (interaction.options as CommandInteractionOptionResolver).getNumber("pitch", true);
        if (pitch >= -1.0 && pitch <= 1.0) {
            voiceSettings.pitch[interaction.guildId!] = pitch;
        } else {
            await interaction.reply({ content: "音高は -1.0 から 1.0 の間でなければなりません。", flags: MessageFlags.Ephemeral });
        }
    }
};