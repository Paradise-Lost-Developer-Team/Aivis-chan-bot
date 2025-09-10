import { SlashCommandBuilder } from '@discordjs/builders';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { currentSpeaker, speakVoice, textChannels, voiceClients, updateJoinChannelsConfig, loadJoinChannels } from '../../utils/TTS-Engine';
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
    let voiceChannel = (interaction as any).options.get("voice_channel")?.channel as VoiceChannel;
    let textChannel = (interaction as any).options.get("text_channel")?.channel as TextChannel;

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
            // 全Botの状況を取得してプライマリ優先（pro/1st）で選択、同順位は最も空いているBot
            const infos = await getBotInfos();
            // ギルドに参加しているBotの中から選択（該当がなければエラー）
            const guildBots = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
            if (guildBots.length === 0) throw new Error('no-bot-available');
            const picked = pickLeastBusyBot(guildBots);
            if (!picked) throw new Error('no-bot-available');

            await instructJoin(picked.bot, { guildId, voiceChannelId: voiceChannel.id, textChannelId: textChannel.id });

            // join_channels.json に保存（本Botの設定としても記録）
            updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);

            await interaction.reply({
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
            if (!interaction.replied) {
                await interaction.reply({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('最も空いているBotへの接続指示に失敗しました。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()]
                });
            }
        }
    }
};