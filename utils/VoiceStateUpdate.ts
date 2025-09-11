import { Events, Client, VoiceState } from 'discord.js';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { speakAnnounce, loadAutoJoinChannels, voiceClients, currentSpeaker, updateLastSpeechTime, monitorMemoryUsage, autoJoinChannels } from './TTS-Engine';
import { saveVoiceState, setTextChannelForGuild } from './voiceStateManager';
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
            .setTitle('自動接続通知')
            .setDescription(`最も空いているBotに <#${channel ? channel.id : '不明'}> への接続を指示しました。`)
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

export function VoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member!;
        const guildId = member.guild.id;
        const voiceClient = voiceClients[guildId];
    
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
                                await instructLeave(picked.bot, { guildId });
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
                    const textChannelId = autoJoinData?.textChannelId;
                    const infos = await getBotInfos();
                    const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
                    const picked = pickLeastBusyBot(eligible);
                    if (picked) {
                        await instructJoin(picked.bot, { guildId, voiceChannelId: newState.channel!.id, textChannelId });
                        await sendAutoJoinEmbed(member, newState.channel, client, textChannelId, picked.bot.baseUrl);
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
                    await speakAnnounce(`${nickname} さんが入室しました。`, guildId, client);
                    updateLastSpeechTime(); // 発話時刻を更新
                }
            } else if (oldState.channel && !newState.channel) {
                // ユーザーがボイスチャンネルから退出したとき
                if (voiceClient.joinConfig.channelId === oldState.channel.id) {
                    const nickname = member.displayName;
                    await speakAnnounce(`${nickname} さんが退室しました。`, guildId, client);
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
                            const infos = await getBotInfos();
                            const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
                            const picked = pickLeastBusyBot(eligible);
                            if (picked) {
                                await instructJoin(picked.bot, { guildId, voiceChannelId, textChannelId });
                                await sendAutoJoinEmbed(member, newState.channel, client, textChannelId, picked.bot.baseUrl);
                            }
                        } catch (error) {
                            console.error('Auto-join orchestrate error:', error);
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
            // 最後に対話のあったチャンネルをテキストチャンネルとして記録する処理をここに追加できる
            // 例えば、最後のメッセージの受信チャンネルを関連テキストチャンネルとして設定する
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
            setTextChannelForGuild(guild.id, message.channel.id);
            saveVoiceState(client);
        }
    });

    // 定期的に状態を保存（念のため）
    setInterval(() => {
        if (Object.keys(voiceClients).length > 0) {
            saveVoiceState(client);
        }
    }, 5 * 60 * 1000); // 5分ごと
}