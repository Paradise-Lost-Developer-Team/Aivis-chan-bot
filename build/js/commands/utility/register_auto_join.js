"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builders_1 = require("@discordjs/builders");
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("../../utils/TTS-Engine");
module.exports = {
    data: new builders_1.SlashCommandBuilder()
        .setName('register_auto_join')
        .setDescription('TTSエンジンの自動参加チャンネルを登録します')
        .addChannelOption(option => option.setName('voice_channel')
        .setDescription('自動参加するチャンネル')
        .setRequired(true)
        .addChannelTypes(discord_js_1.ChannelType.GuildVoice))
        .addChannelOption(option => option.setName('text_channel')
        .setDescription('自動参加するチャンネル')
        .setRequired(false)
        .addChannelTypes(discord_js_1.ChannelType.GuildText)),
    async execute(interaction) {
        const voiceChannel = interaction.options.get("voice_channel")?.channel;
        const textChannel = interaction.options.get("text_channel")?.channel;
        if (!voiceChannel) {
            await interaction.reply("ボイスチャンネルが指定されていません。");
            return;
        }
        (0, TTS_Engine_1.loadAutoJoinChannels)();
        const guildId = interaction.guildId;
        TTS_Engine_1.autoJoinChannels[guildId] = {
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel ? textChannel.id : voiceChannel.id
        };
        (0, TTS_Engine_1.saveAutoJoinChannels)(); // ここで保存
        await interaction.reply(`サーバー ${interaction.guild.name} の自動入室チャンネルを ${voiceChannel.name} に設定しました。`);
    }
};
//# sourceMappingURL=register_auto_join.js.map