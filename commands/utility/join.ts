import { SlashCommandBuilder } from '@discordjs/builders';
import { VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { currentSpeaker, speakVoice, voiceClients, loadAutoJoinChannels, setJoinCommandChannel, setTextChannelForGuildInMap, addTextChannelsForGuildInMap, updateJoinChannelsConfig } from '../../utils/TTS-Engine';
import { getBotInfos, pickLeastBusyBot, instructJoin } from '../../utils/botOrchestrator';
import { setTextChannelForGuild } from '../../utils/voiceStateManager';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('BOTをチャンネルに参加させます')
        .addChannelOption(option =>
            option.setName('voice_channel')
                .setDescription('参加するボイスチャンネル')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildVoice))
        .addChannelOption(option =>
            option.setName('text_channel')
                .setDescription('読み上げるテキストチャンネル（省略時はコマンド実行チャンネル）')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText)),
    async execute(interaction: CommandInteraction) {
        await interaction.deferReply();

        // ===== ボイスチャンネルの取得 =====
        let voiceChannel = (interaction as any).options.get("voice_channel")?.channel as VoiceChannel;

        if (!voiceChannel) {
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

        // ===== テキストチャンネルの取得 =====
        let textChannel: TextChannel | null = null;
        const explicitTextChannel = (interaction as any).options.get("text_channel")?.channel as TextChannel | undefined;
        
        if (explicitTextChannel) {
            // 明示的に指定された場合
            if (explicitTextChannel.type === ChannelType.GuildText) {
                textChannel = explicitTextChannel;
                console.log(`[join] Explicit text channel provided: ${textChannel.name} (${textChannel.id})`);
            } else {
                console.warn(`[join] ⚠️ Specified channel is not a text channel: ${explicitTextChannel.id} (type: ${explicitTextChannel.type})`);
                await interaction.followUp({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('指定されたチャンネルはテキストチャンネルではありません。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        } else {
            // 指定されていない場合：コマンド実行チャンネルを使用
            const currentChannel = interaction.channel;
            if (currentChannel && currentChannel.type === ChannelType.GuildText) {
                textChannel = currentChannel as TextChannel;
                console.log(`[join] Using command execution channel: ${textChannel.name} (${textChannel.id})`);
            } else {
                // コマンド実行チャンネルがテキストチャンネルでない場合（スラッシュコマンドでは通常起こらない）
                console.warn(`[join] Command execution channel is not a text channel, trying to find fallback`);
                
                // フォールバック: ボイスチャンネルと同名のテキストチャンネル
                if (voiceChannel.parent) {
                    const matchingTextChannel = voiceChannel.parent.children.cache.find(
                        ch => ch.type === ChannelType.GuildText && 
                              ch.name.toLowerCase() === voiceChannel.name.toLowerCase()
                    ) as TextChannel | undefined;
                    
                    if (matchingTextChannel) {
                        textChannel = matchingTextChannel;
                        console.log(`[join] Found matching text channel: ${textChannel.name} (${textChannel.id})`);
                    }
                }
                
                // それでも見つからない場合
                if (!textChannel) {
                    await interaction.followUp({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('エラー')
                                .setDescription('読み上げ対象のテキストチャンネルが特定できませんでした。`text_channel` オプションで明示的に指定してください。')
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
        
        console.log(`[join] Target channels - Voice: ${voiceChannel.name} (${voiceChannel.id}), Text: ${textChannel.name} (${textChannel.id})`);
        
        // ===== 既存接続のチェック =====
        const vcByGet = (typeof getVoiceConnection === 'function') ? (getVoiceConnection(guildId) || getVoiceConnection(voiceChannel.id)) : undefined;
        let voiceClient = vcByGet || voiceClients[guildId] || voiceClients[voiceChannel.id];
        
        if (voiceClient) {
            const currentVoiceChannel = interaction.guild?.channels.cache.find(
                ch => ch.isVoiceBased() && ch.members.has(interaction.client.user!.id)
            ) as VoiceChannel | undefined;
            
            if (currentVoiceChannel) {
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
                    // 既に同じボイスチャンネルに接続している場合、テキストチャンネルのみ更新
                    setTextChannelForGuildInMap(guildId, textChannel);
                    setJoinCommandChannel(guildId, textChannel.id);
                    
                    try {
                        if (typeof updateJoinChannelsConfig === 'function') {
                            await updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);
                        }
                    } catch (e) {
                        console.warn('[join] updateJoinChannelsConfig failed (already-connected):', e);
                    }
                    
                    await interaction.editReply({
                        embeds: [addCommonFooter(
                            new EmbedBuilder()
                                .setTitle('接続中')
                                .setDescription(`✅ 既に「${currentVoiceChannel.name}」に接続しています。\n📝 読み上げチャンネルを「${textChannel.name}」に設定しました。`)
                                .setColor(0x00bfff)
                        )],
                        components: [getCommonLinksRow()]
                    });
                    return;
                }
            }
        }
        
        // ===== テキストチャンネルの設定 =====
        setTextChannelForGuildInMap(guildId, textChannel);
        setTextChannelForGuild(guildId, textChannel.id);
        setJoinCommandChannel(guildId, textChannel.id);

        console.log(`[join] Settings updated - Guild: ${guildId}, Voice: ${voiceChannel.name} (${voiceChannel.id}), Text: ${textChannel.name} (${textChannel.id})`);

        // ===== Bot選択と接続指示 =====
        try {
            const infos = await getBotInfos();
            const guildBots = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
            if (guildBots.length === 0) throw new Error('no-bot-available');
            
            const picked = pickLeastBusyBot(guildBots);
            if (!picked) throw new Error('no-bot-available');

            console.log(`[join] instructJoin - bot=${picked.bot.name}, guild=${guildId}, voice=${voiceChannel.id}, text=${textChannel.id}`);
            
            await instructJoin(picked.bot, { 
                guildId, 
                voiceChannelId: voiceChannel.id, 
                textChannelId: textChannel.id, 
                requestingChannelId: textChannel.id
            });
            
            try {
                if (typeof updateJoinChannelsConfig === 'function') {
                    await updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);
                }
            } catch (e) {
                console.warn('[join] updateJoinChannelsConfig failed (post-instructJoin):', e);
            }
 
            await interaction.editReply({
                embeds: [addCommonFooter(
                    new EmbedBuilder()
                        .setTitle('接続完了')
                        .setDescription(`✅ **${voiceChannel.name}** に参加しました！`)
                        .setColor(0x00bfff)
                        .addFields(
                            { name: '🔊 接続先', value: `<#${voiceChannel.id}>`, inline: true },
                            { name: '📝 読み上げチャンネル', value: `<#${textChannel.id}>`, inline: true },
                            { name: '👤 実行者', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setFooter({ text: `Bot: ${picked.bot.name}` })
                        .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
                )],
                components: [getCommonLinksRow()]
            });
            
            loadAutoJoinChannels();
        } catch (error) {
            console.error('[join] Error:', error);
            const msg = (error as Error)?.message === 'no-bot-available'
                ? 'このギルドに参加しているBotがいません。先にBotを招待してください。'
                : '接続に失敗しました。しばらくしてから再度お試しください。';
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