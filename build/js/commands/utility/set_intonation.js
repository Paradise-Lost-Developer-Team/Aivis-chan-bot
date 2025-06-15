"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('set_intonation')
        .setDescription('TTSエンジンの感情表現の強さを設定します')
        .addNumberOption(option => option.setName('intonation')
        .setDescription('設定する感情表現強度レベル (0.0から2.0)')
        .setRequired(true)),
    async execute(interaction) {
        const options = interaction.options;
        const intonation = options.getNumber('intonation');
        if (intonation !== null && intonation >= 0.0 && intonation <= 2.0) {
            TTS_Engine_1.voiceSettings.intonation[interaction.user.id] = intonation;
            await interaction.reply(`感情表現強度を ${intonation} に設定しました。`);
        }
        else {
            await interaction.reply({ content: '感情表現強度は 0.0 から 2.0 の間でなければなりません。', flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
};
//# sourceMappingURL=set_intonation.js.map