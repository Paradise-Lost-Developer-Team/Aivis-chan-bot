"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('set_tempo')
        .setDescription('TTSエンジンのテンポを設定します')
        .addNumberOption(option => option.setName('tempo')
        .setDescription('設定するテンポレベル (0.0から2.0)')
        .setRequired(true)),
    async execute(interaction) {
        const options = interaction.options;
        const tempo = options.getNumber('tempo', true);
        if (tempo >= 0.0 && tempo <= 2.0) {
            TTS_Engine_1.voiceSettings.tempo[interaction.user.id] = tempo;
            await interaction.reply(`テンポを ${tempo} に設定しました。`);
        }
        else {
            await interaction.reply({ content: 'テンポは 0.0 から 2.0 の間でなければなりません。', flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
};
//# sourceMappingURL=set_tempo.js.map