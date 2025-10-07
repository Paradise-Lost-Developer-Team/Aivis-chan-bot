import { SlashCommandBuilder } from '@discordjs/builders';
import { VoiceConnectionStatus } from '@discordjs/voice';
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
            // Accept the current channel if it's any text-based channel (text channels, threads, news, etc.)
            // This is more flexible than only allowing ChannelType.GuildText and handles thread contexts.
            const currentChannel = interaction.channel as any;
            const clientUser = interaction.client.user!;
            try {
                const isTextBased = typeof currentChannel?.isTextBased === 'function' ? currentChannel.isTextBased() : (currentChannel && currentChannel.type === ChannelType.GuildText);
                if (currentChannel && isTextBased) {
                    const perms = (currentChannel as any).permissionsFor ? (currentChannel as any).permissionsFor(clientUser) : null;
                    const canSend = perms ? perms.has && perms.has('SendMessages') : false;
                    if (canSend) {
                        // cast to any to allow threads/news channels as well
                        textChannel = currentChannel as any;
                    }
                }
            } catch (e) {
                // ignore permission-check errors and fall through to explicit require
            }

            // If still not found, require explicit specification from the user.
            if (!textChannel) {
                await interaction.followUp({
                    embeds: [addCommonFooter(
                        new EmbedBuilder()
                            .setTitle('テキストチャンネルが必要です')
                            .setDescription('テキストチャンネルが指定されていないか、Botがメッセージを送信できません。`/join text_channel:#チャンネル名` のように明示的に指定してください。')
                            .setColor(0xffa500)
                    )],
                    components: [getCommonLinksRow()],
                    flags: MessageFlags.Ephemeral
                });
                return;
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
                    setTextChannelForGuildInMap(guildId, textChannel); // テキストチャンネルの更新のみ
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
        
        // If user didn't explicitly specify text_channel, register execution channel + category channels as candidates
        try {
            if ((interaction as any).options.get('text_channel')?.channel) {
                setTextChannelForGuildInMap(guildId, textChannel);
            } else {
                const execChannel = interaction.channel && interaction.channel.type === ChannelType.GuildText ? interaction.channel as TextChannel : undefined;
                const candidates: TextChannel[] = [];
                if (execChannel) candidates.push(execChannel);
                try {
                    const guild = interaction.guild;
                    if (guild) {
                        const vc = guild.channels.cache.get(voiceChannel.id) as any;
                        if (vc && vc.parentId) {
                            for (const ch of guild.channels.cache.values()) {
                                try {
                                    if (ch.type === ChannelType.GuildText && (ch as TextChannel).parentId === vc.parentId) candidates.push(ch as TextChannel);
                                } catch (_) { continue; }
                            }
                        }
                    }
                } catch (_) {}
                const uniq = Array.from(new Map(candidates.map(c => [c.id, c])).values());
                // Detailed debug logging for join candidates
                try {
                    const candidateInfo = uniq.map(c => `${c.id}:${c.name}`).join(', ');
                    console.log(`[join] guild=${guildId} exec=${interaction.channelId} voice=${voiceChannel.id} candidates=[${candidateInfo}]`);
                } catch (logErr) {
                    // ignore logging errors
                }
                // Choose a single preferred text channel to persist for this guild.
                // Preference order: explicit execChannel (if present), provided textChannel, first candidate.
                try {
                    let preferred: TextChannel | undefined = undefined;
                    if (execChannel) preferred = execChannel;
                    if (!preferred && textChannel) preferred = textChannel;
                    if (!preferred && uniq.length > 0) preferred = uniq[0];
                    if (preferred) {
                        setTextChannelForGuildInMap(guildId, preferred);
                    } else if (uniq.length > 0) {
                        // as a very last resort, persist the first candidate
                        setTextChannelForGuildInMap(guildId, uniq[0]);
                    }
                } catch (err) {
                    console.warn('[join] failed to set single text channel mapping, falling back to previous behavior', err);
                    try { addTextChannelsForGuildInMap(guildId, uniq); } catch (_) { setTextChannelForGuildInMap(guildId, textChannel); }
                }
            }
        } catch (e) {
            setTextChannelForGuildInMap(guildId, textChannel);
        }
        // joinコマンド実行チャンネルを記録（実行チャンネルがテキストでない場合は選択したテキストチャンネルを使う）
        try {
            // record the channel where the command was executed; accept any text-based channel (threads etc.)
            const execIsText = (interaction.channel as any) && (typeof (interaction.channel as any).isTextBased === 'function' ? (interaction.channel as any).isTextBased() : ((interaction.channel as any).type === ChannelType.GuildText));
            const execChannelId = execIsText ? interaction.channelId : textChannel.id;
            setJoinCommandChannel(guildId, execChannelId);
        } catch (e) {
            // fallback
            setJoinCommandChannel(guildId, interaction.channelId);
        }
        // テキストチャンネルをvoiceStateManagerに保存
        setTextChannelForGuild(guildId, textChannel.id);

        try {
            // 全Botの状況を取得し、当該ギルドに在籍するBotの中から「最も空いている」個体を選択
            const infos = await getBotInfos();
            const guildBots = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
            if (guildBots.length === 0) throw new Error('no-bot-available');
            const picked = pickLeastBusyBot(guildBots);
            if (!picked) throw new Error('no-bot-available');

            // include the channel where the command was executed so the target bot can prefer it
            const requestingChannelId = interaction.channel && typeof (interaction.channel as any).isTextBased === 'function' && (interaction.channel as any).isTextBased() ? interaction.channelId : undefined;
            try {
                console.log(`[join] instructJoin payload guild=${guildId} picked=${picked.bot.name} voice=${voiceChannel.id} text=${textChannel.id} reqCh=${requestingChannelId ?? 'none'}`);
            } catch (_) {}
            await instructJoin(picked.bot, { guildId, voiceChannelId: voiceChannel.id, textChannelId: textChannel.id, requestingChannelId });
            // Persist authoritative voice->text mapping for this guild so follower bots can resolve the mapping later
            try {
                if (typeof updateJoinChannelsConfig === 'function') {
                    updateJoinChannelsConfig(guildId, voiceChannel.id, textChannel.id);
                }
            } catch (e) {
                console.warn('[join] updateJoinChannelsConfig failed:', e);
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