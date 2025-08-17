import { SlashCommandBuilder } from '@discordjs/builders';
import { joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { currentSpeaker, speakVoice, textChannels, voiceClients, updateJoinChannelsConfig, loadJoinChannels } from '../../utils/TTS-Engine';

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
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
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
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('既に接続中')
                                .setDescription(`❌ 既に別のボイスチャンネル「${currentVoiceChannel.name}」に接続しています。\n他のチャンネルに移動させるには、まず \/leave コマンドで退出させてから再度呼んでください。`)
                                .setColor(0xffa500)
                        )],
                        flags: MessageFlags.Ephemeral,
                        components: [getCommonLinksRow()]
                    });
                    return;
                } else {
                    // 同じチャンネルの場合
                    textChannels[guildId] = textChannel; // テキストチャンネルの更新のみ
                    await interaction.reply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('既に接続中')
                                .setDescription(`✅ 既に「${currentVoiceChannel.name}」に接続しています。テキストチャンネルを「${textChannel.name}」に設定しました。`)
                                .setColor(0x00bfff)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
            }
        }
        
        textChannels[guildId] = textChannel;

        try {
            voiceClient = await joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guildId,
                adapterCreator: interaction.guild!.voiceAdapterCreator as any,
                selfDeaf: true, // スピーカーはOFF（聞こえない）
                selfMute: false // マイクはON（話せる）
            });
            voiceClients[guildId] = voiceClient;

            // 新規：取得したチャネル情報を join_channels.json に保存
            updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);

            await interaction.reply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('接続完了')
                        .setDescription(`✅ ${voiceChannel.name} に接続しました。`)
                        .setColor(0x00bfff)
                        .addFields(
                            { name: '接続先', value: voiceChannel.name, inline: true },
                            { name: 'テキストチャンネル', value: textChannel.name, inline: true },
                            { name: '実行者', value: `${interaction.user.username} (${interaction.user.tag})`, inline: true }
                        )
                        .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
                )],
                components: [getCommonLinksRow()]
            });
            loadJoinChannels();

            // 追加: Ready になるまで待機
            await new Promise<void>((resolve) => {
                const onReady = () => {
                    voiceClient.off(VoiceConnectionStatus.Disconnected, onError);
                    resolve();
                };
                const onError = () => {
                    voiceClient.off(VoiceConnectionStatus.Ready, onReady);
                    resolve();
                };
                voiceClient.once(VoiceConnectionStatus.Ready, onReady);
                voiceClient.once(VoiceConnectionStatus.Disconnected, onError);
            });

            // 読み上げ開始
            await speakVoice("接続しました。", currentSpeaker[guildId] || 888753760, guildId);

        } catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('ボイスチャンネルへの接続に失敗しました。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
            }
        }
    }
};