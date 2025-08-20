// 自動接続Embed送信を共通化
async function sendAutoJoinEmbed(member: any, channel: any, client: any, autoJoinData: any) {
    try {
        if (autoJoinData && autoJoinData.textChannelId) {
            const textChannel = member.guild.channels.cache.get(autoJoinData.textChannelId);
            if (textChannel && textChannel.isTextBased()) {
                const botUser = client.user;
                const embed = new EmbedBuilder()
                    .setTitle('自動接続通知')
                    .setDescription(`BotがVC <#${channel ? channel.id : '不明'}> に自動接続しました。`)
                    .addFields(
                        { name: '接続先', value: `<#${channel ? channel.id : '不明'}>`, inline: true },
                        { name: 'テキストチャンネル', value: `<#${autoJoinData.textChannelId}>`, inline: true },
                        { name: '接続した人', value: `<@${member.user.id}>`, inline: true },
                    )
                    .addFields(
                        { name: '使用Bot', value: botUser ? `<@${botUser.id}>` : '不明', inline: true }
                    )
                    .setThumbnail(botUser?.displayAvatarURL() ?? null)
                    .setFooter({
                        text: '利用規約 | プライバシーポリシー | サポートサーバー | ホームページ | ソースコード',
                        iconURL: undefined
                    })
                    .setTimestamp();
                await textChannel.send({
                    embeds: [embed],
                    components: [
                        {
                            type: 1, // ActionRow
                            components: [
                                {
                                    type: 2, // Button
                                    style: 5, // Link
                                    label: '利用規約',
                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Term-of-Service/'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'プライバシーポリシー',
                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Privacy-Policy/'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'サポートサーバー',
                                    url: 'https://discord.gg/8n2q2r2y2d'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'ホームページ',
                                    url: 'https://www.aivis-chan-bot.com'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'ソースコード',
                                    url: 'https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot'
                                }
                            ]
                        }
                    ]
                });
            }
        }
    } catch (err) {
        console.error('[自動接続Embed送信失敗]:', err);
    }
}
import { Events, Client, VoiceState, ChannelType } from 'discord.js';
import { VoiceConnectionStatus, joinVoiceChannel } from '@discordjs/voice';
import { speakVoice, speakAnnounce, loadAutoJoinChannels, voiceClients, currentSpeaker, updateLastSpeechTime, monitorMemoryUsage, autoJoinChannels } from './TTS-Engine'; // autoJoinChannelsを追加
import { saveVoiceState, setTextChannelForGuild } from './voiceStateManager';
import { isJoinLeaveEnabled } from './joinLeaveManager';
import { getTextChannelForGuild } from './voiceStateManager';
import { EmbedBuilder } from 'discord.js';
import { client } from 'index';

export function VoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member!;
        const guildId = member.guild.id;
        const voiceClient = voiceClients[guildId];
    
        if (member.user.bot) return;

        // --- 一時VC(TempVoice/PartyBeast)やtempVoiceフラグ付きVCからの移動を検知しBotも追従 ---
        // tempVoiceフラグが有効な場合は、作成チャンネルにはBotは入らず、ユーザーが新しいVCに移動した時のみBotが追従
        const isTempCreateChannel = (ch: any) => {
            if (!ch) return false;
            // autoJoinChannelsのvoiceChannelIdが作成チャンネルID
            return autoJoinChannels[guildId]?.tempVoice && autoJoinChannels[guildId]?.voiceChannelId === ch.id;
        }
        // ユーザーが一時VC作成チャンネルから新しいVCに移動した場合のみBotが追従
        if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            if (isTempCreateChannel(oldState.channel)) {
            // Botがまだ新しいVCにいない場合のみ追従
            if (!voiceClient || voiceClient.joinConfig.channelId !== newState.channel.id) {
                try {
                const connection = joinVoiceChannel({
                    channelId: newState.channel.id,
                    guildId: guildId,
                    adapterCreator: newState.guild.voiceAdapterCreator,
                    selfDeaf: false,
                });
                voiceClients[guildId] = connection;
                // autoJoinChannelsも更新
                if (autoJoinChannels[guildId]) {
                    autoJoinChannels[guildId].voiceChannelId = newState.channel.id;
                    // 新しいVCと同じカテゴリ内のテキストチャンネルがなければ、auto_join_channels.jsonの設定を使う
                    const autoJoinData = loadAutoJoinChannels()[guildId];
                    if (autoJoinData) {
                        autoJoinChannels[guildId].textChannelId = autoJoinData.textChannelId;
                        autoJoinChannels[guildId].isManualTextChannelId = !!autoJoinData.textChannelId;
                        console.log(`[TempVC作成] auto_join_channels.jsonのテキストチャンネルを設定: ${autoJoinData.textChannelId}`);
                    } else {
                        autoJoinChannels[guildId].textChannelId = undefined;
                        autoJoinChannels[guildId].isManualTextChannelId = false;
                        console.warn(`[TempVC作成] auto_join_channels.jsonに設定がありません: guildId=${guildId}`);
                    }
                    // TTSの再生先を新しいVCに確実に追従させるため、currentSpeakerの状態をリセット
                    if (currentSpeaker[guildId] !== undefined) {
                        delete currentSpeaker[guildId];
                    }
                    // 必要ならここでテスト発話も可能（例: await speakAnnounce('TTS追従テスト', guildId, client);）
                }
                // 状態保存
                if (typeof saveVoiceState === 'function') saveVoiceState(client);
                // 一時VC自動接続アナウンス
                await speakAnnounce('一時VCに自動接続しました。', guildId, client);
                updateLastSpeechTime();
                // 一時VCかどうかに関係なく自動接続Embedを送信
                await sendAutoJoinEmbed(member, newState.channel, client, autoJoinChannels[guildId]);
// 自動接続Embed送信を共通化
async function sendAutoJoinEmbed(member: any, channel: any, client: any, autoJoinData: any) {
    try {
        if (autoJoinData && autoJoinData.textChannelId) {
            const textChannel = member.guild.channels.cache.get(autoJoinData.textChannelId);
            if (textChannel && textChannel.isTextBased()) {
                const botUser = client.user;
                const embed = new EmbedBuilder()
                    .setTitle('自動接続通知')
                    .setDescription(`BotがVC <#${channel ? channel.id : '不明'}> に自動接続しました。`)
                    .addFields(
                        { name: '接続先', value: `<#${channel ? channel.id : '不明'}>`, inline: true },
                        { name: 'テキストチャンネル', value: `<#${autoJoinData.textChannelId}>`, inline: true },
                        { name: '接続した人', value: `<@${member.user.id}>`, inline: true },
                    )
                    .addFields(
                        { name: '使用Bot', value: botUser ? `<@${botUser.id}>` : '不明', inline: true }
                    )
                    .setThumbnail(botUser?.displayAvatarURL() ?? null)
                    .setFooter({
                        text: '利用規約 | プライバシーポリシー | サポートサーバー | ホームページ | ソースコード',
                        iconURL: undefined
                    })
                    .setTimestamp();
                await textChannel.send({
                    embeds: [embed],
                    components: [
                        {
                            type: 1, // ActionRow
                            components: [
                                {
                                    type: 2, // Button
                                    style: 5, // Link
                                    label: '利用規約',
                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Term-of-Service/'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'プライバシーポリシー',
                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Privacy-Policy/'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'サポートサーバー',
                                    url: 'https://discord.gg/8n2q2r2y2d'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'ホームページ',
                                    url: 'https://www.aivis-chan-bot.com'
                                },
                                {
                                    type: 2,
                                    style: 5,
                                    label: 'ソースコード',
                                    url: 'https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot'
                                }
                            ]
                        }
                    ]
                });
            }
        }
    } catch (err) {
        console.error('[自動接続Embed送信失敗]:', err);
    }
}
            } catch (err) {
                console.error('[TempVC作成] 追従処理中にエラーが発生しました:', err);
            } finally {
                console.log(`[TempVC作成] Botが${oldState.channel.name}→${newState.channel.name}へ追従`);
            }
        }
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
                // tempVoiceフラグが有効な場合はこの自動接続処理をスキップ（Bot二重入室防止）
                if (guildData.tempVoice !== true && voiceChannelId === newState.channel.id) {
                    if (!voiceClients[guildId] || voiceClients[guildId].state.status !== VoiceConnectionStatus.Ready) {
                        try {
                            // 接続インスタンスを作成
                            console.log(`ボイスチャンネル ${newState.channel.name} に接続を開始します...`);
                            const voiceClient = joinVoiceChannel({
                                channelId: newState.channel.id,
                                guildId: guildId,
                                adapterCreator: newState.guild.voiceAdapterCreator,
                                selfDeaf: false,
                            });
                            // 一時VCかどうかに関係なく自動接続Embedを送信
                            await sendAutoJoinEmbed(member, newState.channel, client, guildData);
                            // 切断通知
                            const botUser = client.user;
                            const embed = new EmbedBuilder()
                                .setTitle('自動切断通知')
                                .setDescription(`ボイスチャンネル <#${(oldState.channel && typeof oldState.channel === 'object' && 'id' in oldState.channel) ? (oldState.channel as { id: string }).id : '不明'}> から自動切断しました。`)
                                .addFields(
                                    { name: '切断元', value: (oldState.channel && 'id' in oldState.channel) ? `<#${(oldState.channel as { id: string }).id}>` : '不明', inline: true },
                                    { name: 'テキストチャンネル', value: textChannelId ? `<#${textChannelId}>` : '不明', inline: true },
                                )
                                .addFields(
                                    { name: '使用Bot', value: botUser ? `<@${botUser.id}>` : '不明', inline: true }
                                )
                                .setThumbnail(botUser?.displayAvatarURL() ?? null)
                                .setTimestamp();
                            // ここでtextChannelを取得
                            let textChannel: any = null;
                            if (textChannelId) {
                                textChannel = member.guild.channels.cache.get(textChannelId);
                            }
                            if (textChannel && textChannel.isTextBased()) {
                                textChannel.send({
                                    embeds: [embed],
                                    components: [
                                        {
                                            type: 1,
                                            components: [
                                                {
                                                    type: 2,
                                                    style: 5,
                                                    label: '利用規約',
                                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Term-of-Service/'
                                                },
                                                {
                                                    type: 2,
                                                    style: 5,
                                                    label: 'プライバシーポリシー',
                                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/Privacy-Policy/'
                                                },
                                                {
                                                    type: 2,
                                                    style: 5,
                                                    label: 'サポートサーバー',
                                                    url: 'https://discord.gg/8n2q2r2y2d'
                                                },
                                                {
                                                    type: 2,
                                                    style: 5,
                                                    label: 'ホームページ',
                                                    url: 'https://paradise-lost-developer-team.github.io/Aivis-chan-bot-docs/'
                                                },
                                                {
                                                    type: 2,
                                                    style: 5,
                                                    label: 'ソースコード',
                                                    url: 'https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot'
                                                }
                                            ]
                                        }
                                    ]
                                });
                            }
                        } catch (error) {
                            console.error(`Error while creating temporary voice channel: ${error}`);
                            return;
                        }
                        voiceClient.once('ready', onReady);
                    }
                    delete voiceClients[guildId];
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

function onReady(...args: any[]): void {
    throw new Error('Function not implemented.');
}
