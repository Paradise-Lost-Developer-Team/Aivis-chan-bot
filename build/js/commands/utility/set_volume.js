"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine"); // Adjust the import path as necessary
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('set_volume')
        .setDescription('TTSエンジンの音量を設定します')
        .addNumberOption(option => option.setName('volume')
        .setDescription('設定する音量レベル (0.0から2.0)')
        .setRequired(true)),
    async execute(interaction) {
        const options = interaction.options;
        const volume = options.getNumber('volume', true);
        if (volume >= 0.0 && volume <= 2.0) {
            TTS_Engine_1.voiceSettings.volume[interaction.user.id] = volume;
            await interaction.reply(`音量を ${volume} に設定しました。`);
        }
        else {
            await interaction.reply({ content: '音量は 0.0 から 2.0 の間でなければなりません。', flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
};
//# sourceMappingURL=set_volume.js.map