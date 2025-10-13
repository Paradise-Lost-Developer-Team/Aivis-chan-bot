import { SlashCommandBuilder } from '@discordjs/builders';
import { VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { VoiceChannel, TextChannel, CommandInteraction, MessageFlags, ChannelType } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { addCommonFooter, getCommonLinksRow } from '../../utils/embedTemplate';
import { currentSpeaker, speakVoice, voiceClients, loadAutoJoinChannels, setJoinCommandChannel, setTextChannelForGuildInMap, addTextChannelsForGuildInMap, updateJoinChannelsConfig } from '../../utils/TTS-Engine';
import { getBotInfos, pickLeastBusyBot, instructJoin } from '../../utils/botOrchestrator';
import { setTextChannelForGuild } from '../../utils/voiceStateManager';

/**
 * 適切なテキストチャンネルを検出する
 */
function detectTextChannel(
    interaction: CommandInteraction,
    voiceChannel: VoiceChannel,
    explicitTextChannel?: TextChannel
): TextChannel | null {
    const guild = interaction.guild;
    if (!guild) return null;

    console.log(`[join:detectTextChannel] Starting detection for voice: ${voiceChannel.name} (${voiceChannel.id})`);

    // 1. 明示的に指定されたテキストチャンネル（型チェック済み）
    if (explicitTextChannel && explicitTextChannel.type === ChannelType.GuildText) {
        console.log(`[join:detectTextChannel] ✅ Using explicit text channel: ${explicitTextChannel.name} (${explicitTextChannel.id})`);
        return explicitTextChannel;
    }

    // 2. コマンド実行チャンネル（テキストベースであることを確認）
    const currentChannel = interaction.channel;
    if (currentChannel && currentChannel.type === ChannelType.GuildText) {
        const textCh = currentChannel as TextChannel;
        try {
            const perms = textCh.permissionsFor(interaction.client.user!);
            if (!perms || perms.has(['ViewChannel', 'SendMessages'])) {
                console.log(`[join:detectTextChannel] ✅ Using command execution channel: ${textCh.name} (${textCh.id})`);
                return textCh;
            }
        } catch (e) {
            console.warn(`[join:detectTextChannel] Permission check failed for command channel:`, e);
        }
    }

    // 3. ボイスチャンネルと同名のテキストチャンネル
    if (voiceChannel.parent) {
        const matchingTextChannel = voiceChannel.parent.children.cache.find(
            ch => ch.type === ChannelType.GuildText && 
                  ch.name.toLowerCase() === voiceChannel.name.toLowerCase()
        ) as TextChannel | undefined;

        if (matchingTextChannel) {
            try {
                const perms = matchingTextChannel.permissionsFor(interaction.client.user!);
                if (!perms || perms.has(['ViewChannel', 'SendMessages'])) {
                    console.log(`[join:detectTextChannel] ✅ Found matching text channel by name: ${matchingTextChannel.name} (${matchingTextChannel.id})`);
                    return matchingTextChannel;
                }
            } catch (e) {
                console.warn(`[join:detectTextChannel] Permission check failed for matching channel:`, e);
            }
        }
    }

    // 4. 同じカテゴリー内の一般的なテキストチャンネル
    if (voiceChannel.parent) {
        const chatChannelPatterns = ['chat', 'text', 'general', 'vc-log', 'log', 'bot', '参加通知'];
        const categoryTextChannels = voiceChannel.parent.children.cache.filter(
            ch => ch.type === ChannelType.GuildText
        );

        for (const pattern of chatChannelPatterns) {
            const foundChannel = categoryTextChannels.find(
                ch => (ch as TextChannel).name.toLowerCase().includes(pattern)
            ) as TextChannel | undefined;

            if (foundChannel) {
                try {
                    const perms = foundChannel.permissionsFor(interaction.client.user!);
                    if (!perms || perms.has(['ViewChannel', 'SendMessages'])) {
                        console.log(`[join:detectTextChannel] ✅ Found category chat channel: ${foundChannel.name} (${foundChannel.id}) [pattern: ${pattern}]`);
                        return foundChannel;
                    }
                } catch (e) {
                    console.warn(`[join:detectTextChannel] Permission check failed for pattern channel:`, e);
                }
            }
        }

        // カテゴリー内の最初のテキストチャンネル
        const firstTextChannel = categoryTextChannels.first() as TextChannel | undefined;
        if (firstTextChannel) {
            try {
                const perms = firstTextChannel.permissionsFor(interaction.client.user!);
                if (!perms || perms.has(['ViewChannel', 'SendMessages'])) {
                    console.log(`[join:detectTextChannel] ✅ Using first text channel in category: ${firstTextChannel.name} (${firstTextChannel.id})`);
                    return firstTextChannel;
                }
            } catch (e) {
                console.warn(`[join:detectTextChannel] Permission check failed for first channel:`, e);
            }
        }
    }

    // 5. ギルドのシステムチャンネル
    if (guild.systemChannel) {
        try {
            const perms = guild.systemChannel.permissionsFor(interaction.client.user!);
            if (!perms || perms.has(['ViewChannel', 'SendMessages'])) {
                console.log(`[join:detectTextChannel] ⚠️ Using guild system channel: ${guild.systemChannel.name} (${guild.systemChannel.id})`);
                return guild.systemChannel;
            }
        } catch (e) {
            console.warn(`[join:detectTextChannel] Permission check failed for system channel:`, e);
        }
    }

    console.warn(`[join:detectTextChannel] ❌ No suitable text channel found`);
    return null;
}

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
                .setDescription('参加するテキストチャンネル')
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

        // ===== テキストチャンネルの検出（重要な修正）=====
        const explicitTextChannel = (interaction as any).options.get("text_channel")?.channel as TextChannel | undefined;
        
        // 🔴 重要: ボイスチャンネルがテキストチャンネルとして誤認識されないようにチェック
        let textChannel: TextChannel | null = null;
        
        if (explicitTextChannel) {
            // 明示的に指定されたチャンネルの型を確認
            if (explicitTextChannel.type === ChannelType.GuildText) {
                textChannel = explicitTextChannel;
                console.log(`[join] Explicit text channel provided: ${textChannel.name} (${textChannel.id})`);
            } else {
                console.warn(`[join] ⚠️ Specified channel is not a text channel: ${explicitTextChannel.id} (type: ${explicitTextChannel.type})`);
                await interaction.followUp({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('エラー')
                            .setDescription('指定されたチャンネルはテキストチャンネルではありません。テキストチャンネルを指定してください。')
                            .setColor(0xff0000)
                    )],
                    components: [getCommonLinksRow()],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        } else {
            // 自動検出
            textChannel = detectTextChannel(interaction, voiceChannel);
            
            if (!textChannel) {
                await interaction.followUp({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('テキストチャンネルが必要です')
                            .setDescription('適切なテキストチャンネルが見つかりませんでした。`/join text_channel:#チャンネル名` のように明示的に指定してください。')
                            .setColor(0xffa500)
                    )],
                    components: [getCommonLinksRow()],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        const guildId = interaction.guildId!;
        
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
                    setTextChannelForGuildInMap(guildId, textChannel);
                    try {
                        if (typeof updateJoinChannelsConfig === 'function') {
                            await updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);
                        }
                    } catch (e) {
                        console.warn('[join:1st] updateJoinChannelsConfig failed (already-connected):', e);
                    }
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
        
        // ===== テキストチャンネルの設定 =====
        setTextChannelForGuildInMap(guildId, textChannel);
        setTextChannelForGuild(guildId, textChannel.id);
        
        // joinコマンド実行チャンネルを記録
        const execIsText = interaction.channel && interaction.channel.type === ChannelType.GuildText;
        const execChannelId = execIsText ? interaction.channelId : textChannel.id;
        setJoinCommandChannel(guildId, execChannelId);

        console.log(`[join] Final selection - Guild: ${guildId}, Voice: ${voiceChannel.name} (${voiceChannel.id}), Text: ${textChannel.name} (${textChannel.id}), Exec: ${execChannelId}`);

        // ===== Bot選択と接続指示 =====
        try {
            const infos = await getBotInfos();
            const guildBots = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
            if (guildBots.length === 0) throw new Error('no-bot-available');
            
            const picked = pickLeastBusyBot(guildBots);
            if (!picked) throw new Error('no-bot-available');

            const requestingChannelId = execIsText ? interaction.channelId : undefined;
            
            console.log(`[join] instructJoin payload - guild=${guildId}, picked=${picked.bot.name}, voice=${voiceChannel.id}, text=${textChannel.id}, reqCh=${requestingChannelId ?? 'none'}`);
            
            await instructJoin(picked.bot, { 
                guildId, 
                voiceChannelId: voiceChannel.id, 
                textChannelId: textChannel.id, 
                requestingChannelId 
            });
            
            try {
                if (typeof updateJoinChannelsConfig === 'function') {
                    await updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);
                }
            } catch (e) {
                console.warn('[join:1st] updateJoinChannelsConfig failed (post-instructJoin):', e);
            }
 
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
            
            loadAutoJoinChannels();
        } catch (error) {
            console.error('[join] Error:', error);
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