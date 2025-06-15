"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('set_pitch')
        .setDescription('TTSエンジンの音高を設定します')
        .addNumberOption(option => option.setName('pitch')
        .setDescription('設定する音高レベル (-0.15から0.15)')
        .setRequired(true)),
    async execute(interaction) {
        const options = interaction.options;
        const pitch = options.getNumber('pitch', true);
        if (pitch >= -0.15 && pitch <= 0.15) {
            TTS_Engine_1.voiceSettings.pitch[interaction.user.id] = pitch;
            await interaction.reply(`音高を ${pitch} に設定しました。`);
        }
        else {
            await interaction.reply({ content: '音高は -0.15 から 0.15 の間でなければなりません。', flags: discord_js_1.MessageFlags.Ephemeral });
        }
    },
};
//# sourceMappingURL=set_pitch.js.map