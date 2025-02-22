import { CommandInteraction, MessageFlags } from 'discord.js';
import { voiceSettings } from 'set_voiceSettings';

module.exports = {
    data: {
        name: "set_tempo",
        description: "TTSエンジンのテンポを設定します",
        options: [
            {
                name: "tempo",
                type: "NUMBER",
                description: "設定するテンポレベル (0.0から2.0)",
                required: true
            }
        ]
    },
    async execute(interaction: CommandInteraction) {
        if (interaction.commandName === "set_tempo") {
            const tempo = interaction.options.get("tempo")?.value as number | undefined;
            if (typeof tempo === 'number' && tempo >= 0.0 && tempo <= 2.0) {
                voiceSettings.tempo[interaction.guildId!] = tempo;
                await interaction.reply(`テンポを ${tempo} に設定しました。`);
            } else {
                await interaction.reply({ content: "無効なテンポ値です。0.0から2.0の間で設定してください。", flags: MessageFlags.Ephemeral });
            }
        }
    }
};