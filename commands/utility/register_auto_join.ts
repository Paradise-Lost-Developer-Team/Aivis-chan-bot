import { VoiceChannel, TextChannel } from 'discord.js';
import { loadAutoJoinChannels, saveAutoJoinChannels, autoJoinChannels } from '../../TTS-Engine';

module.exports = {
    name: "register_auto_join",
    async execute(interaction: any) {
        const voiceChannel = interaction.options.get("voice_channel")?.channel as VoiceChannel;
        const textChannel = interaction.options.get("text_channel")?.channel as TextChannel;

        if (!voiceChannel) {
            await interaction.reply("ボイスチャンネルが指定されていません。");
            return;
        }

        loadAutoJoinChannels();
        const guildId = interaction.guildId!;
        autoJoinChannels[guildId] = {
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel ? textChannel.id : voiceChannel.id
        };

        saveAutoJoinChannels();  // ここで保存
        await interaction.reply(`サーバー ${interaction.guild!.name} の自動入室チャンネルを ${voiceChannel.name} に設定しました。`);
    }
};