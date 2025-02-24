import { SlashCommandBuilder } from '@discordjs/builders';
import { joinVoiceChannel, VoiceConnection } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType } from 'discord.js';
import { currentSpeaker, play_audio, speakVoice, textChannels, voiceClients } from '../../TTS-Engine';

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
        // deferReply で必ずインタラクションを保留状態にする
        if (!interaction.deferred) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

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
<<<<<<< HEAD
            await interaction.editReply(`ボイスチャンネル ${voiceChannel.name} に接続しました。`);
            
            // 接続の安定化のために短いディレイを追加
=======
            await interaction.reply(`${voiceChannel.name} に接続しました。`);
            
            // 接続の安定化のため、短いディレイを追加
>>>>>>> ecef8dac88b1495630c8b37725afbcec1690b104
            await new Promise(resolve => setTimeout(resolve, 500));

            // Bot接続時のアナウンス
            const path = await speakVoice("接続しました。", currentSpeaker[guildId] || 888753760, guildId);
            await play_audio(voiceClient as VoiceConnection, path, guildId, interaction);
        } catch (error) {
            console.error(error);
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
            }
        }
    }
};