import { Events, Client, VoiceState, GuildMember, Collection } from 'discord.js';
import { VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { speakAnnounce, voiceClients, updateLastSpeechTime, monitorMemoryUsage, addTextChannelsForGuildInMap, determineMessageTargetChannel } from './TTS-Engine';

export function setupVoiceStateUpdateHandlers(client: Client) {
    // ユーザーのボイス状態の変化を監視
    client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
        try {
            // BOTの状態変化は無視
            if (oldState.member?.user.bot || newState.member?.user.bot) {
                return;
            }

            const guildId = oldState.guild?.id || newState.guild?.id;
            if (!guildId) return;

            const guild = client.guilds.cache.get(guildId);
            if (!guild) return;

            // 現在のボイス接続を確認
            let voiceClient = voiceClients[guildId];
            if (!voiceClient || voiceClient.state.status !== VoiceConnectionStatus.Ready) {
                return; // ボイス接続がない場合は何もしない
            }

            const botVoiceChannelId = voiceClient.joinConfig?.channelId;
            if (!botVoiceChannelId) return;

            const member = oldState.member || newState.member;
            if (!member) return;

            // ボットが接続しているチャンネルに関連する変化のみ処理
            const isRelevantChange = 
                oldState.channelId === botVoiceChannelId || 
                newState.channelId === botVoiceChannelId;

            if (!isRelevantChange) return;

            // ユーザーの入室・退室アナウンス
            if (!oldState.channelId && newState.channelId === botVoiceChannelId) {
                // 入室
                const message = `${member.displayName}さんが入室しました`;
                console.log(`[6th Bot] 入室アナウンス: ${message} (ギルド: ${guild.name})`);
                try {
                        const speakTargetVoiceChannelId = voiceClient?.joinConfig?.channelId ?? guildId;
                        await speakAnnounce(message, speakTargetVoiceChannelId);
                    updateLastSpeechTime();
                } catch (error) {
                    console.error(`[6th Bot] 入室アナウンスエラー:`, error);
                }
            } else if (oldState.channelId === botVoiceChannelId && !newState.channelId) {
                // 退室
                const message = `${member.displayName}さんが退室しました`;
                console.log(`[6th Bot] 退室アナウンス: ${message} (ギルド: ${guild.name})`);
                try {
                        const speakTargetVoiceChannelId = voiceClient?.joinConfig?.channelId ?? guildId;
                        await speakAnnounce(message, speakTargetVoiceChannelId);
                    updateLastSpeechTime();
                } catch (error) {
                    console.error(`[6th Bot] 退室アナウンスエラー:`, error);
                }

                // 全員退出チェック
                await checkAndLeaveIfEmpty(guildId, botVoiceChannelId, guild);
            }

        } catch (error) {
            console.error(`[6th Bot] VoiceStateUpdate エラー:`, error);
        } finally {
            // メモリ使用状況をチェック
            monitorMemoryUsage();
        }
    });

    // ボットがボイスチャンネルに参加した場合（存在しなかった→存在する）
    client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
        try {
            if (!oldState.channel && newState.channel && newState.member?.id === client.user?.id) {
                const guild = newState.member!.guild;
                determineMessageTargetChannel(guild.id).then((persisted: boolean) => {
                    if (!persisted) {
                        try {
                            const vc = newState.channel;
                            const categoryId = vc?.parentId || (vc?.parent && (vc.parent as any).id);
                            if (categoryId) {
                                const me = guild.members.cache.get(client.user?.id || '');
                                const candidates: any[] = Array.from(guild.channels.cache.values()).filter((c: any) => c.type === 0 && c.parentId === categoryId);
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
                                        addTextChannelsForGuildInMap(guild.id, allowed as any[]);
                                        console.log(`[BotJoin:6th] guild=${guild.id} 登録されたテキスト候補数=${allowed.length}`);
                                    } catch (e) {
                                        console.error('[BotJoin:6th] addTextChannelsForGuildInMap エラー:', e);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('[BotJoin:6th] 内部処理エラー:', e);
                        }
                    }
                }).catch((e: any) => {
                    console.error('[BotJoin:6th] determineMessageTargetChannel エラー:', e);
                });
            }
        } catch (e) {
            console.error('[BotJoin:6th] エラー:', e);
        }
    });
}

// 全員退出時の自動退出チェック
async function checkAndLeaveIfEmpty(guildId: string, voiceChannelId: string, guild: any) {
    try {
        const voiceChannel = guild.channels.cache.get(voiceChannelId);
        if (!voiceChannel || !('members' in voiceChannel)) return;

        const membersCollection = voiceChannel.members as Collection<string, GuildMember>;
        const humanMembers = membersCollection.filter((member) => !member.user.bot);

        if (humanMembers.size === 0) {
            console.log(`[5th Bot] 全員退出により自動退出: ギルド ${guild.name}`);
            
            // ボイス接続を切断
            const voiceClient = voiceClients[guildId];
            if (voiceClient) {
                try {
                    voiceClient.destroy();
                    delete voiceClients[guildId];
                    console.log(`[6th Bot] ボイス接続を切断しました: ギルド ${guild.name}`);
                } catch (error) {
                    console.error(`[6th Bot] ボイス接続切断エラー:`, error);
                }
            }
        }
    } catch (error) {
        console.error(`[6th Bot] 全員退出チェックエラー:`, error);
    }
}