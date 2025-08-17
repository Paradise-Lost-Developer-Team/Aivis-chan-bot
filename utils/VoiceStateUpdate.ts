import { Events, Client, VoiceState } from 'discord.js';
import { VoiceConnectionStatus, joinVoiceChannel } from '@discordjs/voice';
import { speakVoice, speakAnnounce, loadAutoJoinChannels, voiceClients, currentSpeaker, updateLastSpeechTime, monitorMemoryUsage, autoJoinChannels } from './TTS-Engine'; // autoJoinChannelsを追加
import { saveVoiceState, setTextChannelForGuild } from './voiceStateManager';
import { isJoinLeaveEnabled } from './joinLeaveManager';
import { getTextChannelForGuild } from './voiceStateManager';
import { EmbedBuilder } from 'discord.js';

export function VoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member!;
        const guildId = member.guild.id;
        const voiceClient = voiceClients[guildId];
    
        if (member.user.bot) return;

        // --- 一時VC(TempVoice/PartyBeast)からの移動を検知しBotも追従 ---
        // 一時VC判定: チャンネル名に"TempVoice"や"PartyBeast"が含まれる
        const isTempVC = (ch: any) => ch && ch.name && (ch.name.includes('TempVoice') || ch.name.includes('PartyBeast'));
        if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            if (isTempVC(oldState.channel)) {
                // Botが同じ一時VCにいる場合のみ追従
                if (voiceClient && voiceClient.joinConfig.channelId === oldState.channel.id) {
                    // 新しいVCへBotを移動
                    try {
                        const connection = joinVoiceChannel({
                            channelId: newState.channel.id,
                            guildId: guildId,
                            adapterCreator: newState.guild.voiceAdapterCreator,
                            selfDeaf: false,
                        });
                        voiceClients[guildId] = connection;
                        // autoJoinChannelsも更新（必要なら）
                        if (autoJoinChannels[guildId]) {
                            autoJoinChannels[guildId].voiceChannelId = newState.channel.id;
                        }
                        // 状態保存
                        if (typeof saveVoiceState === 'function') saveVoiceState(client);
                        console.log(`[TempVC移動] Botも${oldState.channel.name}→${newState.channel.name}へ移動`);
                    } catch (err) {
                        console.error('[TempVC移動] Botの移動失敗:', err);
                    }
                }
            }
        }
    
        if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
            if (!oldState.channel && newState.channel) {
                // ユーザーがボイスチャンネルに参加したとき
                if (voiceClient.joinConfig.channelId === newState.channel.id) {
                    const nickname = member.displayName;
                    await speakAnnounce(`${nickname} さんが入室しました。`, guildId);
                    updateLastSpeechTime(); // 発話時刻を更新
                    // join/leave embed通知
                    if (isJoinLeaveEnabled(guildId)) {
                        const textChannelId = getTextChannelForGuild(guildId);
                        if (textChannelId) {
                            const textChannel = member.guild.channels.cache.get(textChannelId);
                            if (textChannel?.isTextBased()) {
                                const embed = new EmbedBuilder()
                                    .setTitle('入室通知')
                                    .setDescription(`${nickname} さんが入室しました`)
                                    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                                    .setThumbnail(member.user.displayAvatarURL())
                                    .addFields(
                                        { name: 'ユーザー名', value: member.user.tag, inline: true },
                                        { name: '代名詞', value: '未設定', inline: true },
                                        { name: '自己紹介', value: '未設定' },
                                        { name: 'サーバー参加日', value: member.joinedAt ? member.joinedAt.toLocaleDateString() : '不明', inline: true },
                                        { name: 'Discord参加日', value: member.user.createdAt.toLocaleDateString(), inline: true },
                                        { name: '役職', value: member.roles.highest.name, inline: true },
                                        { name: 'ボイスチャンネル', value: newState.channel.name, inline: true }
                                    )
                                    .setTimestamp();
                                await textChannel.send({ embeds: [embed] });
                            }
                        }
                    }
                }
            } else if (oldState.channel && !newState.channel) {
                // ユーザーがボイスチャンネルから退出したとき
                if (voiceClient.joinConfig.channelId === oldState.channel.id) {
                    const nickname = member.displayName;
                    await speakAnnounce(`${nickname} さんが退室しました。`, guildId);
                    updateLastSpeechTime(); // 発話時刻を更新
                    // join/leave embed通知
                    if (isJoinLeaveEnabled(guildId)) {
                        const textChannelId = getTextChannelForGuild(guildId);
                        if (textChannelId) {
                            const textChannel = member.guild.channels.cache.get(textChannelId);
                            if (textChannel?.isTextBased()) {
                                const embed = new EmbedBuilder()
                                    .setTitle('退室通知')
                                    .setDescription(`${nickname} さんが退室しました`)
                                    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                                    .setThumbnail(member.user.displayAvatarURL())
                                    .addFields(
                                        { name: 'ユーザー名', value: member.user.tag, inline: true },
                                        { name: '代名詞', value: '未設定', inline: true },
                                        { name: '自己紹介', value: '未設定' },
                                        { name: 'サーバー参加日', value: member.joinedAt ? member.joinedAt.toLocaleDateString() : '不明', inline: true },
                                        { name: 'Discord参加日', value: member.user.createdAt.toLocaleDateString(), inline: true },
                                        { name: '役職', value: member.roles.highest.name, inline: true },
                                        { name: 'ボイスチャンネル', value: oldState.channel.name, inline: true }
                                    )
                                    .setTimestamp();
                                await textChannel.send({ embeds: [embed] });
                            }
                        }
                    }
    
                    // ボイスチャンネルに誰もいなくなったら退室
                    if (oldState.channel && oldState.channel.members.filter(member => !member.user.bot).size === 0) {  // ボイスチャンネルにいるのがBOTだけの場合
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
                if (voiceChannelId === newState.channel.id) {
                    if (!voiceClients[guildId] || voiceClients[guildId].state.status !== VoiceConnectionStatus.Ready) {
                        try {
                            // 接続インスタンスを作成
                            console.log(`ボイスチャンネル ${newState.channel.name} に接続を開始します...`);
                            const voiceClient = joinVoiceChannel({
                                channelId: newState.channel.id,
                                guildId: newState.guild.id,
                                adapterCreator: newState.guild.voiceAdapterCreator as any,
                                selfDeaf: true,   // スピーカーはOFF（聞こえない）
                                selfMute: false   // マイクはON（話せる）
                            });
                            
                            // 接続が安定するまで待機
                            await new Promise<void>((resolve) => {
                                const onReady = () => {
                                    voiceClient.removeListener('error', onError);
                                    console.log(`ボイスチャンネル接続完了: ${newState.channel?.name}`);
                                    resolve();
                                };
                                
                                const onError = (error: Error) => {
                                    voiceClient.removeListener('ready', onReady);
                                    console.error(`接続エラー: ${error.message}`);
                                    resolve(); // エラーでも進行
                                };
                                
                                voiceClient.once('ready', onReady);
                                voiceClient.once('error', onError);
                                
                                // 既に接続済みの場合
                                if (voiceClient.state.status === VoiceConnectionStatus.Ready) {
                                    voiceClient.removeListener('error', onError);
                                    console.log(`既に接続済み: ${newState.channel?.name}`);
                                    resolve();
                                }
                                
                                // タイムアウト
                                setTimeout(() => {
                                    voiceClient.removeListener('ready', onReady);
                                    voiceClient.removeListener('error', onError);
                                    console.log(`接続タイムアウト: ${newState.channel?.name}`);
                                    resolve();
                                }, 25000);
                            });
                            
                            voiceClients[guildId] = voiceClient;
                            console.log(`Connected to voice channel ${voiceChannelId} in guild ${guildId}`);

                            // 安定するまで少し待機
                            await new Promise(resolve => setTimeout(resolve, 2000));  // 2秒に延長

                            // ボイスチャンネル参加アナウンス
                            try {
                                console.log(`自動接続アナウンス生成開始: ${guildId}`);
                                await speakAnnounce("自動接続しました。", guildId);
                                updateLastSpeechTime(); // 発話時刻を更新
                            } catch (audioError) {
                                console.error(`自動接続アナウンス再生エラー: ${audioError}`);
                            }
                        } catch (error) {
                            console.error(`Error: failed to connect to voice channel - ${error}`);
                        }
                    }
                }
            } else if (oldState.channel && !newState.channel) {
                if (voiceChannelId === oldState.channel.id) {
                    if (voiceClients[guildId] && voiceClients[guildId].state.status === VoiceConnectionStatus.Ready) {
                        if (oldState.channel && oldState.channel.members.filter(member => !member.user.bot).size === 0) {
                            try {
                                console.log(`${voiceClients[guildId].joinConfig.guildId}: Only BOT is left in the channel, disconnecting.`);
                                voiceClients[guildId].disconnect();
                                delete voiceClients[guildId];
                            } catch (error) {
                                console.error(`Error while disconnecting: ${error}`);
                            }
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
        
        // メッセージを受け取ったギルドでボットがボイスチャンネルに接続している場合
        const guild = message.guild;
        if (!guild) return;
        
        const me = guild.members.cache.get(client.user?.id || '');
        if (me?.voice.channel) {
            // このテキストチャンネルをボイスチャンネルに関連付け
            setTextChannelForGuild(guild.id, message.channel.id);
            // 状態を保存
            saveVoiceState(client);
        }
    });

    // ボットがボイスチャンネルに参加したときにも状態を保存
    client.on('voiceConnectionStatus', (connection, newStatus) => {
        if (newStatus === 'ready' || newStatus === 'disconnected') {
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