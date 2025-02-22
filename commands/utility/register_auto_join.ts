import { SlashCommandBuilder } from '@discordjs/builders';
import { VoiceChannel, TextChannel, CommandInteraction, ChannelType } from 'discord.js';
import { loadAutoJoinChannels, saveAutoJoinChannels, autoJoinChannels } from '../../TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register_auto_join')
        .setDescription('TTSエンジンの自動参加チャンネルを登録します')
        .addChannelOption(option =>
            option.setName('voice_channel')
                .setDescription('自動参加するチャンネル')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice))
        .addChannelOption(option =>
            option.setName('text_channel')
                .setDescription('自動参加するチャンネル')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)),
    async execute(interaction: CommandInteraction) {
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