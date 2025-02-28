import { SlashCommandBuilder } from '@discordjs/builders';
import { joinVoiceChannel } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType, CommandInteractionOptionResolver } from 'discord.js';
import { currentSpeaker, play_audio, speakVoice, textChannels, voiceClients, updateJoinChannelsConfig, loadJoinChannels } from '../../TTS-Engine';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('BOTをチャンネルに参加させます')
        .addChannelOption(option =>
            option.setName('voice_channel') // 小文字に変更
                .setDescription('参加するボイスチャンネル')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildVoice))
        .addChannelOption(option =>
            option.setName('text_channel') // 小文字に変更
                .setDescription('参加するテキストチャンネル')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)),
    async execute(interaction: CommandInteraction) {
        let voiceChannel = interaction.options.get("voice_channel")?.channel as VoiceChannel;
        let textChannel = interaction.options.get("text_channel")?.channel as TextChannel;

        if (!voiceChannel) {
            // コマンド実行者が接続しているボイスチャンネルを取得
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            if (member?.voice.channel) {
                voiceChannel = member.voice.channel as VoiceChannel;
            } else {
                await interaction.reply("ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。");
                return;
            }
        }

        if (!textChannel) {
            // コマンド実行チャンネルを使用
            textChannel = interaction.channel as TextChannel;
        }

        const guildId = interaction.guildId!;
        
        // 既に接続しているかチェック
        let voiceClient = voiceClients[guildId];
        if (voiceClient) {
            // 現在Botが接続しているボイスチャンネルを取得
            const currentVoiceChannel = interaction.guild?.channels.cache.find(
                ch => ch.isVoiceBased() && ch.members.has(interaction.client.user!.id)
            ) as VoiceChannel | undefined;
            
            if (currentVoiceChannel) {
                // 既に接続しているチャンネルと指定されたチャンネルが異なる場合
                if (currentVoiceChannel.id !== voiceChannel.id) {
                    await interaction.reply({
                        content: `❌ 既に別のボイスチャンネル「${currentVoiceChannel.name}」に接続しています。\n他のチャンネルに移動させるには、まず \`/leave\` コマンドで退出させてから再度呼んでください。`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                } else {
                    // 同じチャンネルの場合
                    textChannels[guildId] = textChannel; // テキストチャンネルの更新のみ
                    await interaction.reply(`✅ 既に「${currentVoiceChannel.name}」に接続しています。テキストチャンネルを「${textChannel.name}」に設定しました。`);
                    return;
                }
            }
        }
        
        textChannels[guildId] = textChannel;

        try {
            voiceClient = await joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator as any
            });
            voiceClients[guildId] = voiceClient;

            // 新規：取得したチャネル情報を join_channels.json に保存
            updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);

            await interaction.reply(`${voiceChannel.name} に接続しました。`);
            loadJoinChannels();

            // Botが接続した際のアナウンス
            const path = await speakVoice("接続しました。", currentSpeaker[guildId] || 888753760, guildId);
            await play_audio(voiceClient, path, guildId, interaction);
        } catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply("ボイスチャンネルへの接続に失敗しました。");
            }
        }
    }
};