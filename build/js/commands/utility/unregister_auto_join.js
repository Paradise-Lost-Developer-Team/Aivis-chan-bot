"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('unregister_auto_join')
        .setDescription('TTSエンジンの自動参加チャンネルを解除します'),
    async execute(interaction) {
        if (!interaction.guildId) {
            await interaction.reply({ content: "サーバー内でのみ使用できるコマンドです。", flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const guildId = interaction.guildId;
        if (TTS_Engine_1.autoJoinChannels[guildId]) {
            (0, TTS_Engine_1.loadAutoJoinChannels)();
            delete TTS_Engine_1.autoJoinChannels[guildId];
            (0, TTS_Engine_1.saveAutoJoinChannels)(); // ここで保存
            await interaction.reply("自動接続設定を解除しました。");
        }
        else {
            await interaction.reply({ content: "このサーバーには登録された自動接続設定がありません。", flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
};
//# sourceMappingURL=unregister_auto_join.js.map