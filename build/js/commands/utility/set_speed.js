"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine"); // Adjust the import path as necessary
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('set_speed')
        .setDescription('TTSエンジンの話速を設定します')
        .addNumberOption(option => option.setName('speed')
        .setDescription('設定する話速レベル (0.5から2.0)')
        .setRequired(true)),
    async execute(interaction) {
        const options = interaction.options;
        const speed = options.getNumber('speed', true);
        if (speed >= 0.5 && speed <= 2.0) {
            TTS_Engine_1.voiceSettings.speed[interaction.user.id] = speed;
            await interaction.reply(`話速を ${speed} に設定しました。`);
        }
        else {
            await interaction.reply({ content: '話速は 0.5 から 2.0 の間でなければなりません。', flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
};
//# sourceMappingURL=set_speed.js.map