import { SlashCommandBuilder } from '@discordjs/builders';
import { joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType, CommandInteractionOptionResolver } from 'discord.js';
import { currentSpeaker, play_audio, speakVoice, textChannels, voiceClients, updateJoinChannelsConfig, loadJoinChannels } from '../../TTS-Engine';

// 新規：接続が Ready になるまで待機する関数
function waitForReady(connection: VoiceConnection, timeout = 30000): Promise<VoiceConnection> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (connection.state.status === VoiceConnectionStatus.Ready) {
                clearInterval(interval);
                resolve(connection);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error("VOICE_CONNECT_FAILED: Cannot connect to the voice channel after 30 seconds"));
            }
        }, 1000);
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('BOTをチャンネルに参加します')
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
        // deferReply を呼び出して応答を先延ばしにする
        await interaction.deferReply({ ephemeral: false });
        
        let voiceChannel = interaction.options.get("voice_channel")?.channel as VoiceChannel;
        let textChannel = interaction.options.get("text_channel")?.channel as TextChannel;

        if (!voiceChannel) {
            // コマンド実行者が接続しているボイスチャンネルを取得
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            if (member?.voice.channel) {
                voiceChannel = member.voice.channel as VoiceChannel;
            } else {
                await interaction.editReply("ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。");
                return;
            }
        }

        if (!textChannel) {
            // コマンド実行チャンネルを使用
            textChannel = interaction.channel as TextChannel;
        }

        const guildId = interaction.guildId!;
        textChannels[guildId] = textChannel;

        try {
            let voiceClient = voiceClients[guildId];
            if (voiceClient) {
                await voiceClient.disconnect();
            }
            voiceClient = await joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator as any
            });
            voiceClients[guildId] = voiceClient;

            // 新規：接続が Ready になるまで待機
            await waitForReady(voiceClient);

            // 新規：取得したチャネル情報を join_channels.json に保存
            updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);

            await interaction.editReply(`${voiceChannel.name} に接続しました。`);

            // 短いディレイを入れる
            await new Promise(resolve => setTimeout(resolve, 500));

            loadJoinChannels();

            // Botが接続した際のアナウンス
            const path = await speakVoice("接続しました。", currentSpeaker[guildId] || 888753760, guildId);
            await play_audio(voiceClient, path, guildId, interaction);
        } catch (error) {
            console.error(error);
            await interaction.editReply("ボイスチャンネルへの接続に失敗しました。");
        }
    }
};