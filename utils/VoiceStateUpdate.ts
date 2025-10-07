import { Events, Client, VoiceState, ChannelType } from 'discord.js';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { speakAnnounce, loadAutoJoinChannels, voiceClients, currentSpeaker, updateLastSpeechTime, monitorMemoryUsage, autoJoinChannels, addTextChannelsForGuildInMap, setTextChannelForVoice, setTextChannelForGuildInMap } from './TTS-Engine';
import { saveVoiceState, setTextChannelForGuild, getTextChannelForGuild } from './voiceStateManager';
import { EmbedBuilder } from 'discord.js';
import { getBotInfos, pickLeastBusyBot, instructJoin, instructLeave } from './botOrchestrator';

// 自動接続Embed送信を共通化（通知のみ。実際の接続はオーケストレータが担当）
async function sendAutoJoinEmbed(member: any, channel: any, client: Client, textChannelId?: string, pickedBaseUrl?: string) {
    try {
        if (!textChannelId) return;
        const textChannel: any = member.guild.channels.cache.get(textChannelId);
        if (!textChannel || !textChannel.isTextBased()) return;
        const botUser = client.user;
        const embed = new EmbedBuilder()
            .setTitle('🤖 自動接続通知')
            .setDescription(`<@${member.id}> がボイスチャンネルに参加したため、自動接続を実行しました。`)
            .addFields(
                { name: '接続先', value: `<#${channel ? channel.id : '不明'}>`, inline: true },
                { name: 'テキストチャンネル', value: `<#${textChannelId}>`, inline: true },
                { name: '実行者', value: `<@${member.id}>`, inline: true }
            )
            .setColor(0x00bfff)
            .setThumbnail(botUser?.displayAvatarURL() ?? null)
            .setTimestamp();
        await textChannel.send({ embeds: [embed] });
        console.log(`[自動接続] アナウンス送信完了: ギルド ${member.guild.id} チャンネル ${textChannelId}`);
    } catch (err) {
        console.error('[自動接続Embed送信失敗]:', err);
    }
}

async function sendAutoLeaveEmbed(member: any, channel: any, client: Client, textChannelId?: string, pickedBaseUrl?: string) {
    try {
        if (!textChannelId) return;
        const textChannel: any = member.guild.channels.cache.get(textChannelId);
        if (!textChannel || !textChannel.isTextBased()) return;
        const botUser = client.user;
        const embed = new EmbedBuilder()
            .setTitle('自動退出通知')
            .setDescription(`最も空いているBotに <#${channel ? channel.id : '不明'}> からの退出を指示しました。`)
            .addFields(
                { name: '接続先', value: `<#${channel ? channel.id : '不明'}>`, inline: true },
                { name: 'テキストチャンネル', value: `<#${textChannelId}>`, inline: true }
            )
            .addFields(
                { name: '選択Bot', value: pickedBaseUrl ?? '不明', inline: true }
            )
            .setThumbnail(botUser?.displayAvatarURL() ?? null)
            .setTimestamp();

        await textChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('[自動退出Embed送信失敗]:', err);
    }
}

/**
 * Find preferred text channel for a given voice channel.
 * Priority:
 *  1. Text channel(s) in the same category as the voice channel (with send permission)
 *  2. Text channel with the same name as the voice channel (case-insensitive)
 *  3. Guild system channel
 *  4. First viewable text channel
 */
function findPreferredTextChannel(member: any, voiceChannel: any): string | undefined {
    try {
        const guild = member.guild;
        const me = guild.members.cache.get(member.client?.user?.id || '');

        // 1) same category
        const parentId = voiceChannel?.parentId || (voiceChannel?.parent && (voiceChannel.parent as any).id);
        if (parentId) {
            const candidates = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText && c.parentId === parentId);
            for (const ch of candidates.values()) {
                try {
                    if (!me) return ch.id; // if we can't check perms, return first candidate
                    if ((ch as any).permissionsFor && (ch as any).permissionsFor(me)?.has('SendMessages')) return ch.id;
                } catch (e) {
                    continue;
                }
            }
        }

        // 2) same name
        if (voiceChannel && typeof voiceChannel.name === 'string') {
            const name = voiceChannel.name.toLowerCase();
            const same = guild.channels.cache.find((c: any) => c.type === ChannelType.GuildText && (c.name || '').toLowerCase() === name);
            if (same) return same.id;
        }

    // Do NOT fall back to guild.systemChannelId or the first viewable channel.
    // If no category-related or same-name channel is found, leave undefined so
    // callers know there is no preferred text channel.
    } catch (e) {
        // ignore
    }
    return undefined;
}

/**
 * Return the first text channel that the bot can send messages to.
 * Sorted deterministically by position then id.
 */
function findFirstSendableTextChannel(guild: any, botUser: any): string | undefined {
    try {
        const me = guild.members.cache.get(botUser?.id || '');
        const textChannels: any[] = Array.from(guild.channels.cache.values())
            .filter((c: any) => c.type === ChannelType.GuildText && (c as any).viewable);
        textChannels.sort((a: any, b: any) => {
            if (a.position !== b.position) return a.position - b.position;
            return (a.id || '').localeCompare(b.id || '');
        });
        for (const ch of textChannels) {
            try {
                if (!me) continue;
                if ((ch as any).permissionsFor && (ch as any).permissionsFor(me)?.has('SendMessages')) return ch.id;
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        // ignore
    }
    return undefined;
}

export function VoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member!;
    const guildId = member.guild.id;
    const voiceClient = voiceClients[guildId];
    const speakTargetVoiceChannelId = voiceClient?.joinConfig?.channelId ?? guildId;
    
        if (member.user.bot) return;

        // --- 一時VC(TempVoice/PartyBeast)の追従: 作成チャンネルからユーザーが新しいVCへ移動した場合 ---
        const isTempCreateChannel = (ch: any) => {
            if (!ch) return false;
            return autoJoinChannels[guildId]?.tempVoice && autoJoinChannels[guildId]?.voiceChannelId === ch.id;
        };

        if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            // 移動元VCが空になった場合、本BotがそのVCにいたら切断
            const oldChannel = oldState.channel;
            if (oldChannel && oldChannel.members.filter(m => !m.user.bot).size === 0) {
                if (voiceClient && voiceClient.joinConfig.channelId === oldChannel.id) {
                    // 自分自身のBotが接続している場合は直接切断
                    voiceClient.disconnect();
                    delete voiceClients[guildId];
                } else {
                    // 他のBotが接続している場合はinstructLeaveで切断指示
                        try {
                            const autoJoinData = loadAutoJoinChannels()[guildId];
                            const textChannelId = autoJoinData?.textChannelId;
                            const voiceChannelId = oldChannel.id;
                            const infos = await getBotInfos();
                            const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
                            const picked = pickLeastBusyBot(eligible);
                            if (picked) {
                                await instructLeave(picked.bot, { guildId, voiceChannelId });
                                await sendAutoLeaveEmbed(member, voiceChannelId, client, textChannelId, picked.bot.baseUrl);
                            }
                        } catch (error) {
                            console.error('Failed to instruct leave for empty channel:', error);
                        }
                    }
                }
            }

            if (isTempCreateChannel(oldState.channel)) {
                // 追従先を最も空いているBotに指示
                try {
                    // auto_join_channels.json の既定テキストチャンネルを採用
                    const autoJoinData = loadAutoJoinChannels()[guildId];
                    let textChannelId = autoJoinData?.textChannelId;
                    
                    // テキストチャンネルが指定されていない場合のフォールバック
                        if (!textChannelId) {
                            // Prefer a text channel related to the voice channel (same category or same name)
                            textChannelId = findPreferredTextChannel(member, newState.channel);
                            // Do not use system channel or first-sendable fallback automatically; leave undefined if not found
                            console.log(`[TempVC:pro] テキストチャンネルは未指定のまま: ${textChannelId ?? '未指定'} (guild: ${member.guild.name})`);
                        }
                    
                    const infos = await getBotInfos();
                    const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
                    const picked = pickLeastBusyBot(eligible);
                    if (picked) {
                        await instructJoin(picked.bot, { guildId, voiceChannelId: newState.channel!.id, textChannelId });
                        await sendAutoJoinEmbed(member, newState.channel, client, textChannelId, picked.bot.baseUrl);
                        console.log(`[TempVC:pro] 追従接続指示完了: bot=${picked.bot.name} vc=${newState.channel!.name} tc=${textChannelId}`);
                    }
                    // TTSの再生先を確実にリセット（本Botが選ばれた場合に備える）
                    if (currentSpeaker[guildId] !== undefined) delete currentSpeaker[guildId];
                } catch (err) {
                    console.error('[TempVC作成] 追従指示でエラー:', err);
                    // フォールバック: Bot情報からDiscord上で実際にそのギルドに参加しているBotだけを選んで再試行
                    try {
                        const guild = member.guild;
                        const infos2 = await getBotInfos();
                        const eligibleByPresence = infos2.filter(i => {
                            if (!i.ok) return false;
                            // まずオーケストレータ側のguildIdsを信用する
                            if (i.guildIds?.includes(guildId)) return true;
                            // なければinfo.bot オブジェクトから考えられるDiscordユーザーIDを取り出して
                            // ギルドに参加しているかを確認する
                            const possibleIds: string[] = [];
                            if (i.bot) {
                                if (typeof i.bot === 'string') {
                                    possibleIds.push(i.bot);
                                } else {
                                    // Collect any string-valued properties from the bot object,
                                    // and also handle nested objects that might contain an `id` field.
                                    const botObj = i.bot as any;
                                    for (const val of Object.values(botObj)) {
                                        if (typeof val === 'string') {
                                            possibleIds.push(val);
                                        } else if (val && typeof val === 'object' && typeof (val as any).id === 'string') {
                                            possibleIds.push((val as any).id);
                                        }
                                    }
                                }
                            }
                            return possibleIds.some(id => !!guild.members.cache.get(id));
                        });
                        const picked2 = pickLeastBusyBot(eligibleByPresence);
                        if (picked2) {
                            const autoJoinData2 = loadAutoJoinChannels()[guildId];
                            const textChannelId2 = autoJoinData2?.textChannelId;
                            await instructJoin(picked2.bot, { guildId, voiceChannelId: newState.channel!.id, textChannelId: textChannelId2 });
                            await sendAutoJoinEmbed(member, newState.channel, client, textChannelId2, picked2.bot.baseUrl);
                        }
                        // TTSの再生先を確実にリセット（本Botが選ばれた場合に備える）
                        if (currentSpeaker[guildId] !== undefined) delete currentSpeaker[guildId];
                    } catch (err2) {
                        console.error('[TempVC作成] フォールバック選択でも失敗:', err2);
                    }
                } finally {
                    console.log(`[TempVC作成] 追従指示: ${oldState.channel!.name} → ${newState.channel!.name}`);
                }
            }
    
        if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
            if (!oldState.channel && newState.channel) {
                // ユーザーがボイスチャンネルに参加したとき
                if (voiceClient.joinConfig.channelId === newState.channel.id) {
                    const nickname = member.displayName;
                    await speakAnnounce(`${nickname} さんが入室しました。`, speakTargetVoiceChannelId, client);
                    updateLastSpeechTime(); // 発話時刻を更新
                }
            } else if (oldState.channel && !newState.channel) {
                // ユーザーがボイスチャンネルから退出したとき
                if (voiceClient.joinConfig.channelId === oldState.channel.id) {
                    const nickname = member.displayName;
                    await speakAnnounce(`${nickname} さんが退室しました。`, speakTargetVoiceChannelId, client);
                    updateLastSpeechTime(); // 発話時刻を更新
    
                    // ボイスチャンネルに誰もいなくなったら退室
                    if (oldState.channel && oldState.channel.members.filter(member => !member.user.bot).size === 0) {  // ボイスチャンネルにいるのがBOTだけの場合
                        // 自分自身のBotが接続している場合は直接切断
                        voiceClient.disconnect();
                        delete voiceClients[guildId];
                    }
                }
            }
        }
    
        // Auto join channels handling
        try {
            const autoJoinChannelsData = loadAutoJoinChannels();
    
            const guildData = autoJoinChannelsData[guildId];
            if (!guildData) return;
    
            const voiceChannelId = guildData.voiceChannelId;
            const textChannelId = guildData.textChannelId;
    
            if (!oldState.channel && newState.channel) {
                // tempVoiceの場合は前段で処理済み。通常の自動接続のみ扱う
                if (guildData.tempVoice !== true && voiceChannelId === newState.channel.id) {
                    if (!voiceClients[guildId] || voiceClients[guildId].state.status !== VoiceConnectionStatus.Ready) {
                        try {
                            // テキストチャンネル確実指定
                            let finalTextChannelId = textChannelId;
                            if (!finalTextChannelId) {
                                // Prefer a text channel related to the voice channel
                                finalTextChannelId = findPreferredTextChannel(member, newState.channel);
                                if (!finalTextChannelId) {
                                    // Try system channel only; do NOT pick the first sendable channel automatically
                                    if (member.guild.systemChannelId) {
                                        const sys = member.guild.channels.cache.get(member.guild.systemChannelId);
                                        try {
                                            const me = member.guild.members.cache.get(client.user?.id || '');
                                            if (!me) {
                                                finalTextChannelId = member.guild.systemChannelId;
                                            } else if (sys && (sys as any).permissionsFor && (sys as any).permissionsFor(me)?.has('SendMessages')) {
                                                finalTextChannelId = member.guild.systemChannelId;
                                            }
                                        } catch (e) {
                                            // ignore
                                        }
                                    }
                                }
                                console.log(`[AutoJoin:pro] テキストチャンネル自動選択結果: ${finalTextChannelId ?? '未指定'} (guild: ${member.guild.name})`);
                            }
                            
                            const infos = await getBotInfos();
                            const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
                            const picked = pickLeastBusyBot(eligible);
                            if (picked) {
                                await instructJoin(picked.bot, { guildId, voiceChannelId, textChannelId: finalTextChannelId });
                                await sendAutoJoinEmbed(member, newState.channel, client, finalTextChannelId, picked.bot.baseUrl);
                                console.log(`[AutoJoin:pro] 自動接続完了: bot=${picked.bot.name} vc=${newState.channel.name} tc=${finalTextChannelId}`);
                            }
                        } catch (error) {
                            console.error('[AutoJoin:pro] 自動接続エラー:', error);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error in on_voice_state_update: ${error}`);
        } finally {
            // メモリ使用状況をチェック
            monitorMemoryUsage();
        }
    });

    // ボットのボイス状態が変わったときに保存する処理
    client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
        // ボットの状態が変わった場合のみ処理
        if (oldState.member?.user.bot || newState.member?.user.bot) {
            if (oldState.member?.id === client.user?.id || newState.member?.id === client.user?.id) {
                // 少し遅延を入れて状態を保存（接続処理完了を待つ）
                setTimeout(() => saveVoiceState(client), 1000);
            }
        }
        
        // ボットがボイスチャンネルに参加した場合（存在しなかった→存在する）
        if (!oldState.channel && newState.channel && newState.member?.id === client.user?.id) {
                try {
                    const guild = newState.member!.guild;
                    // 既に永続化されたテキストチャンネルがあれば上書きしない
                    const persisted = getTextChannelForGuild(guild.id);
                    if (!persisted) {
                        // ボイスチャンネルと同じカテゴリ内のテキストチャンネルを候補として登録
                        const vc = newState.channel;
                        const categoryId = vc?.parentId || (vc?.parent && (vc.parent as any).id);
                        if (categoryId) {
                            const me = guild.members.cache.get(client.user?.id || '');
                            const candidates: any[] = Array.from(guild.channels.cache.values()).filter((c: any) => c.type === ChannelType.GuildText && c.parentId === categoryId);
                            const allowed: any[] = [];
                            for (const ch of candidates) {
                                try {
                                    if (!me) {
                                        allowed.push(ch);
                                    } else if ((ch as any).permissionsFor && (ch as any).permissionsFor(me)?.has('SendMessages')) {
                                        allowed.push(ch);
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                            if (allowed.length > 0) {
                                try {
                                    // Prefer a channel whose name matches the voice channel name (strict),
                                    // otherwise pick the first allowed channel. Register only one preferred
                                    // channel to avoid allowing multiple text channels in the same category.
                                    let preferred: any | undefined = undefined;
                                    try {
                                        if (vc && typeof vc.name === 'string') {
                                            const vname = vc.name.toLowerCase();
                                            preferred = allowed.find((ch: any) => (ch && (ch.name || '').toLowerCase()) === vname);
                                        }
                                    } catch (e) { /* ignore */ }
                                    if (!preferred) preferred = allowed[0];

                                    if (preferred) {
                                        try {
                                            (preferred as any).source = 'mapped';
                                            // Persist a strict mapping between this voice channel and the selected text channel
                                            try { setTextChannelForVoice(vc.id, preferred); } catch (_) {}
                                            try { setTextChannelForGuildInMap(guild.id, preferred); } catch (_) {}
                                            console.log(`[BotJoin] guild=${guild.id} voice=${vc.id} mapping-set selected=${(preferred && preferred.id) || preferred}`);
                                        } catch (e) {
                                            console.error('[BotJoin] mapping set エラー:', e);
                                        }
                                    }
                                } catch (e) {
                                    console.error('[BotJoin] 優先チャネル選択エラー:', e);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Bot join処理中のエラー:', e);
                }
        }
    });

    // テキストチャンネルからのメッセージを受信したときに、関連ボイスチャンネルが存在すれば、そのテキストチャンネルを記録
    client.on('messageCreate', message => {
        if (message.author.bot) return;
        const guild = message.guild;
        if (!guild) return;
        const guildId = guild.id;
        const me = guild.members.cache.get(client.user?.id || '');
        // 優先順位: autoJoinChannels > joinChannelsData
        let allow = false;
        const autoJoinData = autoJoinChannels[guildId];
        if (autoJoinData) {
            // 一時VCかつtextChannelId未指定時は、Botが接続中VCのカテゴリ内テキストチャンネル or 最後に発言があったチャンネルも許可
            if (autoJoinData.tempVoice && !autoJoinData.textChannelId) {
                if (me?.voice.channel && me.voice.channel.parent) {
                    const categoryId = me.voice.channel.parent.id;
                    const allowedTextChannels = guild.channels.cache.filter(c => c.type === 0 && c.parentId === categoryId);
                    if (allowedTextChannels.has(message.channel.id)) {
                        allow = true;
                    }
                }
                // さらに「Botが最後に発言を受け取ったチャンネル」も許可（ここでは即時）
                if (me?.voice.channel && message.channel) {
                    allow = allow || true;
                }
            } else if (autoJoinData.textChannelId) {
                if (message.channel.id === autoJoinData.textChannelId) {
                    allow = true;
                }
            }
        } else {
            // autoJoinChannelsがなければjoinChannelsData（従来型）
            // ここでjoinChannelsDataの参照・判定を追加（例: joinChannels[guildId]?.textChannelId など）
            // ...既存のjoinChannelsData判定ロジック...
        }
        if (allow) {
            // Only persist if the channel is explicitly allowed by the auto-join configuration
            // or if it matches the stored textChannelId. Prevent broad unconditional allow.
            const storedTextChannelId = getTextChannelForGuild(guildId);
            const isStoredChannel = storedTextChannelId && storedTextChannelId === message.channel.id;

            // When autoJoinData.tempVoice && no textChannelId, we previously set allow = true unconditionally
            // for any message. Change behavior: only accept messages that are either the stored channel,
            // or inside the same category as the bot's connected VC (if available). As a last resort,
            // accept the channel if the bot is connected to a VC and the message author is in that VC.
            let shouldPersist = false;

            if (isStoredChannel) {
                shouldPersist = true;
            } else if (autoJoinData && autoJoinData.tempVoice && !autoJoinData.textChannelId) {
                const me = guild.members.cache.get(client.user?.id || '');
                if (me?.voice.channel && me.voice.channel.parent) {
                    const categoryId = me.voice.channel.parentId || (me.voice.channel.parent && (me.voice.channel.parent as any).id);
                    if (categoryId && message.channel && (message.channel as any).parentId === categoryId) {
                        shouldPersist = true;
                    }
                }

                // Last-resort: if message author is currently in the same voice channel as the bot,
                // allow persisting. This is stricter than unconditional true for any message.
                if (!shouldPersist && message.member && message.member.voice && message.member.voice.channel && me?.voice.channel) {
                    if (message.member.voice.channel.id === me.voice.channel.id) {
                        shouldPersist = true;
                    }
                }
            }

            if (shouldPersist) {
                setTextChannelForGuild(guild.id, message.channel.id);
                saveVoiceState(client);
            }
        }
    });

    // 定期的に状態を保存（念のため）
    setInterval(() => {
        if (Object.keys(voiceClients).length > 0) {
            saveVoiceState(client);
        }
    }, 5 * 60 * 1000); // 5分ごと
}

