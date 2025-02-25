import { Events, Message, Client, GuildMember, Collection } from 'discord.js';
import { voiceClients, loadAutoJoinChannels, currentSpeaker, speakVoice, getPlayer, createFFmpegAudioSource, MAX_TEXT_LENGTH, loadJoinChannels } from './TTS-Engine'; // Adjust the import path as necessary
import { AudioPlayerStatus, VoiceConnectionStatus, joinVoiceChannel } from '@discordjs/voice';

interface ExtendedClient extends Client {
    // Add any additional properties or methods if needed
}

export function MessageCreate(client: ExtendedClient) {
    client.on(Events.MessageCreate, async (message: Message) => {
        if (message.author.bot) {
            console.log("Message is from a bot, ignoring.");
            return;
        }
    
        try {
            const guildId = message.guildId!;
            let messageContent = message.content;
            let voiceClient = voiceClients[guildId];
            const autoJoinChannelsData = loadAutoJoinChannels();
            const joinChannelsData = loadJoinChannels();
            console.log(`autoJoinChannelsData = ${JSON.stringify(autoJoinChannelsData)}`);
            console.log(`joinChannelsData = ${JSON.stringify(joinChannelsData)}`);
    
            // ここを変更してjoinChannelsDataを先にチェックし、無い場合のみautoJoinChannelsDataを使用
            if (joinChannelsData[guildId]?.textChannelId) {
                if (message.channel.id !== joinChannelsData[guildId].textChannelId) {
                    console.log(`Message is not in the joinChannelsData text channel (${joinChannelsData[guildId].textChannelId}). Ignoring message. Channel ID: ${message.channel.id}`);
                    return;
                }
            } else if (autoJoinChannelsData[guildId]?.textChannelId) {
                if (message.channel.id !== autoJoinChannelsData[guildId].textChannelId) {
                    console.log(`Message is not in the autoJoinChannelsData text channel (${autoJoinChannelsData[guildId].textChannelId}). Ignoring message. Channel ID: ${message.channel.id}`);
                    return;
                }
            } else {
                console.log(`No join configuration for guild ${guildId}. Ignoring message.`);
                return;
            }
    
            // ↓ 自動再接続を行わないように、以下の処理をコメントアウト
            /*
            // voiceClient が "Disconnected" の場合は再接続を試みる
            if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Disconnected) {
                console.log("Voice client is in Disconnected state. Trying to rejoin...");
                const guildAutoJoin = autoJoinChannelsData[guildId];
                if (guildAutoJoin && guildAutoJoin.voiceChannelId) {
                    voiceClient = joinVoiceChannel({
                        channelId: guildAutoJoin.voiceChannelId,
                        guildId: guildId,
                        adapterCreator: message.guild!.voiceAdapterCreator as any
                    });
                    voiceClients[guildId] = voiceClient;
                }
            }
            */
            
            // メッセージ内容の加工
            // スポイラー除外
            if (messageContent.startsWith("||") && messageContent.endsWith("||")) {
                console.log("Message contains spoiler, ignoring.");
                return;
            }
    
            // カスタム絵文字を除外
            if (messageContent.match(/<:[a-zA-Z0-9_]+:[0-9]+>/g)) {
                console.log("Message contains custom emoji, ignoring.");
                return;
            }
    
            // URLを除外
            if (messageContent.match(/https?:\/\/\S+/g)) {
                console.log("Message contains URL, ignoring.");
                return;
            }
    
            // ロールメンションを除外
            if (messageContent.match(/<@&[0-9]+>/g)) {
                console.log("Message contains role mention, ignoring.");
                return;
            }
    
            // チャンネルメンションを除外
            if (messageContent.match(/<#\d+>/g)) {
                console.log("Message contains channel mention, ignoring.");
                return;
            }
    
            // ユーザーメンションをユーザー名に置き換える
            /*
            // ユーザーメンションを除外
            if (messageContent.match(/<@!\d+>/g)) {
                console.log("Message contains user mention, ignoring.");
                return;
            }
            */

            messageContent = messageContent.replace(/<@!?(\d+)>/g, (match, userId) => {
                const user = message.guild?.members.cache.get(userId);
                return user?.displayName || `${userId}さん`;
            });
    
            // コードブロック除外
            if (messageContent.match(/```[\s\S]+```/g)) {
                console.log("Message contains code block, ignoring.");
                return;
            }
    
            // メッセージ先頭に "(音量0)" がある場合は読み上げを行わない
            if (messageContent.startsWith("(音量0)")) {
                console.log("Message starts with (音量0), ignoring.");
                return;
            }
    
            // 以下を追加：BOTが接続しているボイスチャンネルに人がいなければ処理を中断する
            if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
                const voiceChannel = message.guild?.channels.cache.get(voiceClient.joinConfig.channelId!);
                if (voiceChannel && 'members' in voiceChannel) {
                    const membersCollection = voiceChannel.members as Collection<string, GuildMember>;
                    if (membersCollection.filter((member) => !member.user.bot).size === 0) {
                        console.log("No human in the voice channel. Ignoring message.");
                        return;
                    }
                }
            }
            
            // メッセージ読み込みだけで自動接続は行わない
            if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
                console.log("Voice client is connected and message is in the correct text channel. Handling message.");
                await handle_message(message);
            } else {
                console.log(`Voice client is not connected. Ignoring message. Guild ID: ${guildId}`);
            }
        } catch (error) {
            console.error(`An error occurred while processing the message: ${error}`);
        }
    });
}

async function handle_message(message: Message) {
    let messageContent = message.content;
    if (messageContent.length > MAX_TEXT_LENGTH) {
        messageContent = messageContent.substring(0, MAX_TEXT_LENGTH) + "...";
    }
    const guildId = message.guildId!;
    const voiceClient = voiceClients[guildId];

    if (!voiceClient) {
        console.error("Error: Voice client is None, skipping message processing.");
        return;
    }

    console.log(`Handling message: ${messageContent}`);
    const speakerId = currentSpeaker[guildId] || 888753760;  // デフォルトの話者ID
    const path = await speakVoice(messageContent, speakerId, guildId);

    while (voiceClient.state.status === VoiceConnectionStatus.Ready && getPlayer(guildId)?.state.status === AudioPlayerStatus.Playing) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (voiceClients[guildId] !== voiceClient) {
        console.log(`Voice client for guild ${guildId} has changed, stopping playback.`);
        return;
    }

    // 再度 subscribe を行い、ちゃんと再生するようにする
    const resource = createFFmpegAudioSource(path);
    const player = getPlayer(guildId);
    if (player) {
        player.play(await resource);
        voiceClient.subscribe(player);
    } else {
        console.error("Error: Audio player is undefined, cannot subscribe.");
    }
    console.log(`Finished playing message: ${messageContent}`);
}