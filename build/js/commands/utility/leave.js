"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine"); // Adjust the path as necessary
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('leave')
        .setDescription('BOTをチャンネルから退出します'),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const voiceClient = TTS_Engine_1.voiceClients[guildId];
        if (!voiceClient) {
            await interaction.reply({ content: "現在、ボイスチャンネルに接続していません。", flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        try {
            await voiceClient.disconnect();
            delete TTS_Engine_1.voiceClients[guildId];
            (0, TTS_Engine_1.deleteJoinChannelsConfig)(guildId);
            await interaction.reply("ボイスチャンネルから切断しました。");
            (0, TTS_Engine_1.loadJoinChannels)();
        }
        catch (error) {
            console.error(error);
            await interaction.reply({ content: "ボイスチャンネルからの切断に失敗しました。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
};
//# sourceMappingURL=leave.js.map