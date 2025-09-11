import { SlashCommandBuilder } from '@discordjs/builders';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { currentSpeaker, speakVoice, textChannels, voiceClients, updateJoinChannelsConfig, loadJoinChannels, setJoinCommandChannel } from '../../utils/TTS-Engine';
import { getBotInfos, pickLeastBusyBot, instructJoin } from '../../utils/botOrchestrator';

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
        // インタラクションをdeferしてタイムアウトを防ぐ
        await interaction.deferReply();

        let voiceChannel = (interaction as any).options.get("voice_channel")?.channel as VoiceChannel;
        let textChannel = (interaction as any).options.get("text_channel")?.channel as TextChannel;

        if (!voiceChannel) {
            // コマンド実行者が接続しているボイスチャンネルを取得
            const member = interaction.guild?.members.cache.get(interaction.user.id);
            if (member?.voice.channel) {
                voiceChannel = member.voice.channel as VoiceChannel;
            } else {
                await interaction.followUp({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('ボイスチャンネルが指定されておらず、あなたはボイスチャンネルに接続していません。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        if (!textChannel) {
            // コマンド実行チャンネルを使用（テキストチャンネルかどうか確認）
            const currentChannel = interaction.channel;
            if (currentChannel && currentChannel.type === ChannelType.GuildText) {
                textChannel = currentChannel as TextChannel;
            } else {
                // テキストチャンネルでない場合、ギルドの最初のテキストチャンネルを使用
                const firstTextChannel = interaction.guild?.channels.cache
                    .filter(ch => ch.type === ChannelType.GuildText)
                    .first() as TextChannel;
                if (firstTextChannel) {
                    textChannel = firstTextChannel;
                } else {
                    await interaction.followUp({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('エラー')
                                .setDescription('適切なテキストチャンネルが見つかりません。テキストチャンネルを指定してください。')
                                .setColor(0xff0000)
                        )],
                        components: [getCommonLinksRow()],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }
        }

        const guildId = interaction.guildId!;
        
    // 既に接続しているかチェック（本Bot）
    let voiceClient = voiceClients[guildId];
    if (voiceClient) {
            // 現在Botが接続しているボイスチャンネルを取得
            const currentVoiceChannel = interaction.guild?.channels.cache.find(
                ch => ch.isVoiceBased() && ch.members.has(interaction.client.user!.id)
            ) as VoiceChannel | undefined;
            
            if (currentVoiceChannel) {
                // 既に接続しているチャンネルと指定されたチャンネルが異なる場合
                if (currentVoiceChannel.id !== voiceChannel.id) {
                    await interaction.followUp({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('既に接続中')
                                .setDescription(`❌ 既に別のボイスチャンネル「${currentVoiceChannel.name}」に接続しています。\n他のチャンネルに移動させるには、まず \/leave コマンドで退出させてから再度呼んでください。`)
                                .setColor(0xffa500)
                        )],
                        components: [getCommonLinksRow()],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                } else {
                    // 同じチャンネルの場合
                    textChannels[guildId] = textChannel; // テキストチャンネルの更新のみ
                    await interaction.editReply({
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
        // joinコマンド実行チャンネルを記録
        setJoinCommandChannel(guildId, interaction.channelId);

        try {
            // 全Botの状況を取得し、当該ギルドに在籍するBotの中から「最も空いている」個体を選択
            const infos = await getBotInfos();
            const guildBots = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
            if (guildBots.length === 0) throw new Error('no-bot-available');
            const picked = pickLeastBusyBot(guildBots);
            if (!picked) throw new Error('no-bot-available');

            await instructJoin(picked.bot, { guildId, voiceChannelId: voiceChannel.id, textChannelId: textChannel.id });

            // join_channels.json に保存（本Botの設定としても記録）
            updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);

            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('接続指示完了')
                        .setDescription(`✅ 選択Bot (${picked.bot.name}) に <#${voiceChannel.id}> への参加を指示しました。`)
                        .setColor(0x00bfff)
                        .addFields(
                            { name: '接続先', value: `<#${voiceChannel.id}>`, inline: true },
                            { name: 'テキストチャンネル', value: `<#${textChannel.id}>`, inline: true },
                            { name: '実行者', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
                )],
                components: [getCommonLinksRow()]
            });
            loadJoinChannels();
        } catch (error) {
            console.error(error);
            // エラーメッセージを送信
            const msg = (error as Error)?.message === 'no-bot-available'
                ? 'このギルドに参加しているBotがいません。先にBotを招待してください。'
                : '最も空いているBotへの接続指示に失敗しました。';
            await interaction.followUp({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('エラー')
                        .setDescription(msg)
                        .setColor(0xff0000)
                )],
                components: [getCommonLinksRow()],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};