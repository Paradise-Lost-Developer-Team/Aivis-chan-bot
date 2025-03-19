import { Events, Message, Client, GuildMember, Collection } from 'discord.js';
import { voiceClients, loadAutoJoinChannels, currentSpeaker, getPlayer, createFFmpegAudioSource, MAX_TEXT_LENGTH, loadJoinChannels } from './TTS-Engine';
import { AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { enqueueText, Priority } from './VoiceQueue';
import { logError } from './errorLogger';

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
            
            // メッセージ内容の加工
            // スポイラーを置換
            const spoilers = messageContent.match(/\|\|[\s\S]+?\|\|/g) || [];
            spoilers.forEach(spoiler => {
                messageContent = messageContent.replace(spoiler, "ネタバレ");
            });
            
            // カスタム絵文字を置換
            const customEmojis = messageContent.match(/<:[a-zA-Z0-9_]+:[0-9]+>/g) || [];
            customEmojis.forEach(emoji => {
                messageContent = messageContent.replace(emoji, "絵文字");
            });
            
            // 動く絵文字（アニメーション絵文字）を置換
            const animatedEmojis = messageContent.match(/<a:[a-zA-Z0-9_]+:[0-9]+>/g) || [];
            animatedEmojis.forEach(emoji => {
                messageContent = messageContent.replace(emoji, "動く絵文字");
            });

            // URLを置換
            const urls = messageContent.match(/https?:\/\/\S+/g) || [];
            urls.forEach(url => {
                messageContent = messageContent.replace(url, "URL省略");
            });
    
            // ロールメンションを置換
            const roleMentions = messageContent.match(/<@&(\d+)>/g) || [];
            const rolePromises = roleMentions.map(async (mention) => {
                const roleId = mention.match(/\d+/)![0];
                try {
                    const role = await message.guild!.roles.fetch(roleId);
                    return { mention, roleName: role ? `${role.name}` : `@Unknown Role (${roleId})` };
                } catch (error) {
                    console.error(`Failed to fetch role for ID: ${roleId}`, error);
                    return { mention, roleName: `@Unknown Role (${roleId})` };
                }
            });
            const resolvedRoleMentions = await Promise.all(rolePromises);
            resolvedRoleMentions.forEach(({ mention, roleName }) => {
                messageContent = messageContent.replace(mention, roleName);
            });
    
            // チャンネルメンションを置換
            const channelMentions = messageContent.match(/<#(\d+)>/g) || [];
            const channelPromises = channelMentions.map(async (mention) => {
                const channelId = mention.match(/\d+/)![0];
                try {
                    const channel = await message.guild!.channels.fetch(channelId);
                    if (channel && 'name' in channel) {
                        return { mention, channelName: `${channel.name}` };
                    }
                    return { mention, channelName: `#Unknown Channel (${channelId})` };
                } catch (error) {
                    console.error(`Failed to fetch channel for ID: ${channelId}`, error);
                    return { mention, channelName: `#Unknown Channel (${channelId})` };
                }
            });
            const resolvedChannelMentions = await Promise.all(channelPromises);
            resolvedChannelMentions.forEach(({ mention, channelName }) => {
                messageContent = messageContent.replace(mention, channelName);
            });

            // ユーザーメンションを置換
            const userMentions = messageContent.match(/<@!?(\d+)>/g) || [];
            const userPromises = userMentions.map(async (mention) => {
                const userId = mention.match(/\d+/)![0];
                try {
                    const user = await client.users.fetch(userId);
                    return { mention, username: `${user.username}` };
                } catch (error) {
                    console.error(`Failed to fetch user for ID: ${userId}`, error);
                    return { mention, username: `Unknown User (${userId})` };
                }
            });
            const resolvedMentions = await Promise.all(userPromises);
            resolvedMentions.forEach(({ mention, username }) => {
                messageContent = messageContent.replace(mention, username);
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
            
            // メッセージを処理する前にボイスクライアントの接続を確認
            if (voiceClient) {
                // 接続状態を確認し、接続が切れていたら再取得
                if (voiceClient.state.status !== 'ready') {
                    const reconnectedClient = getVoiceConnection(guildId);
                    if (reconnectedClient) {
                        voiceClients[guildId] = reconnectedClient;
                        voiceClient = reconnectedClient;
                        console.log(`ギルド ${guildId} の接続を回復しました`);
                    } else {
                        console.error(`Voice client is not connected. Ignoring message. Guild ID: ${guildId}`);
                        return;
                    }
                }
            }
            
            // メッセージ読み込みだけで自動接続は行わない
            if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
                console.log("Voice client is connected and message is in the correct text channel. Handling message.");
                
                // 文字数制限
                if (messageContent.length > MAX_TEXT_LENGTH) {
                    messageContent = messageContent.substring(0, MAX_TEXT_LENGTH) + "...";
                }
                
                // 優先度の決定
                let priority = Priority.NORMAL;
                
                // システム通知やコマンド応答などは優先度高
                if (messageContent.includes('接続しました') || 
                    messageContent.includes('入室しました') || 
                    messageContent.includes('退室しました')) {
                    priority = Priority.HIGH;
                }
                
                // 長いメッセージやURLが多いメッセージは優先度低
                if (messageContent.length > 100 || messageContent.includes('URL省略')) {
                    priority = Priority.LOW;
                }
                
                // キューにメッセージを追加
                enqueueText(guildId, messageContent, priority, message);
                console.log(`キューに追加: "${messageContent.substring(0, 30)}..." (優先度: ${priority})`);
                
            } else {
                console.log(`ボイスクライアントが接続されていません。メッセージを無視します。ギルドID: ${guildId}`);
            }
        } catch (error) {
            console.error(`メッセージの処理中にエラーが発生しました: ${error}`);
            logError('messageProcessError', error instanceof Error ? error : new Error(String(error)));
        }
    });
}

// 古い関数は削除（キュー処理に置き換えたため）
// async function handle_message(message: Message, messageContent: string) { ... }