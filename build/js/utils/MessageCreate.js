"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageCreate = MessageCreate;
const discord_js_1 = require("discord.js");
const TTS_Engine_1 = require("./TTS-Engine");
const voice_1 = require("@discordjs/voice");
const VoiceQueue_1 = require("./VoiceQueue");
const errorLogger_1 = require("./errorLogger");
const custom_responses_1 = require("./custom-responses");
const smart_tts_1 = require("./smart-tts");
const subscription_1 = require("./subscription");
// 追加: ギルドごとにボイス接続状態の初期化済みかどうかを記録するマップ
const voiceInitMap = {};
function MessageCreate(client) {
    client.on(discord_js_1.Events.MessageCreate, async (message) => {
        if (message.author.bot) {
            console.log("Message is from a bot, ignoring.");
            return;
        }
        try {
            const guildId = message.guildId;
            let messageContent = message.content;
            let voiceClient = TTS_Engine_1.voiceClients[guildId];
            const autoJoinChannelsData = (0, TTS_Engine_1.loadAutoJoinChannels)();
            const joinChannelsData = (0, TTS_Engine_1.loadJoinChannels)();
            // ここを変更してjoinChannelsDataを先にチェックし、無い場合のみautoJoinChannelsDataを使用
            if (joinChannelsData[guildId]?.textChannelId) {
                if (message.channel.id !== joinChannelsData[guildId].textChannelId) {
                    console.log(`Message is not in the joinChannelsData text channel (${joinChannelsData[guildId].textChannelId}). Ignoring message. Channel ID: ${message.channel.id}`);
                    return;
                }
            }
            else if (autoJoinChannelsData[guildId]?.textChannelId) {
                if (message.channel.id !== autoJoinChannelsData[guildId].textChannelId) {
                    console.log(`Message is not in the autoJoinChannelsData text channel (${autoJoinChannelsData[guildId].textChannelId}). Ignoring message. Channel ID: ${message.channel.id}`);
                    return;
                }
            }
            else {
                console.log(`No join configuration for guild ${guildId}. Ignoring message.`);
                return;
            }
            // メッセージ内容の加工
            // スポイラーを置換
            const spoilers = messageContent.match(/\|\|[\s\S]+?\|\|/g) || [];
            spoilers.forEach(spoiler => {
                messageContent = messageContent.replace(spoiler, "ネタバレ");
            });
            // Unicode絵文字を置換（カスタム絵文字/<a:…>タグ内は除外）、アラビア数字単体は除外
            {
                const original = messageContent;
                messageContent = original.replace(/\p{Emoji}/gu, (emoji, offset) => {
                    // 単一のアラビア数字（0-9）の場合は置換しない
                    if (/^[0-9]$/.test(emoji)) {
                        return emoji;
                    }
                    // 絵文字の位置が <…> タグ内かをチェック
                    const openIdx = original.lastIndexOf('<', offset);
                    const closeIdx = original.indexOf('>', offset);
                    if (openIdx !== -1 && closeIdx !== -1 && openIdx < offset && offset < closeIdx) {
                        // タグ内なのでカスタム絵文字 or アニメーション絵文字
                        return emoji;
                    }
                    return '絵文字';
                });
            }
            // カスタム絵文字を置換
            const customEmojis = messageContent.match(/<:[a-zA-Z0-9_]+:[0-9]+>/g) || [];
            customEmojis.forEach(emoji => {
                messageContent = messageContent.replace(emoji, "カスタム絵文字");
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
                const roleId = mention.match(/\d+/)[0];
                try {
                    const role = await message.guild.roles.fetch(roleId);
                    return { mention, roleName: role ? `${role.name}` : `@Unknown Role (${roleId})` };
                }
                catch (error) {
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
                const channelId = mention.match(/\d+/)[0];
                try {
                    const channel = await message.guild.channels.fetch(channelId);
                    if (channel && 'name' in channel) {
                        return { mention, channelName: `${channel.name}` };
                    }
                    return { mention, channelName: `#Unknown Channel (${channelId})` };
                }
                catch (error) {
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
                const userId = mention.match(/\d+/)[0];
                const nickname = message.guild?.members.cache.get(userId)?.nickname || null;
                try {
                    const user = await client.users.fetch(userId);
                    // Use nickname if available, otherwise fallback to username or globalName
                    const displayName = nickname || user.globalName || user.username;
                    return { mention, username: `${displayName}` };
                }
                catch (error) {
                    console.error(`Failed to fetch user for Nickname: ${nickname}`, error);
                    return { mention, username: `Unknown User (${nickname})` };
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
            if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready) {
                const voiceChannel = message.guild?.channels.cache.get(voiceClient.joinConfig.channelId);
                if (voiceChannel && 'members' in voiceChannel) {
                    const membersCollection = voiceChannel.members;
                    if (membersCollection.filter((member) => !member.user.bot).size === 0) {
                        console.log("No human in the voice channel. Ignoring message.");
                        return;
                    }
                }
            }
            // 1度だけボイス接続状態の保存や再取得を行う
            if (!voiceInitMap[guildId]) {
                if (voiceClient) {
                    // 接続状態を確認し、接続が切れていたら再取得
                    if (voiceClient.state.status !== 'ready') {
                        const reconnectedClient = (0, voice_1.getVoiceConnection)(guildId);
                        if (reconnectedClient) {
                            TTS_Engine_1.voiceClients[guildId] = reconnectedClient;
                            voiceClient = reconnectedClient;
                            console.log(`ギルド ${guildId} の接続を回復しました`);
                        }
                        else {
                            console.error(`Voice client is not connected. Ignoring message. Guild ID: ${guildId}`);
                            return;
                        }
                    }
                }
                // 初期化済みフラグを立てる
                voiceInitMap[guildId] = true;
            }
            // メッセージ読み込みだけで自動接続は行わない
            if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready) {
                console.log("Voice client is connected and message is in the correct text channel. Handling message.");
                // 文字数制限
                if (messageContent.length > TTS_Engine_1.MAX_TEXT_LENGTH) {
                    messageContent = messageContent.substring(0, TTS_Engine_1.MAX_TEXT_LENGTH) + "...";
                }
                // 優先度の決定
                let priority = VoiceQueue_1.Priority.NORMAL;
                // システム通知やコマンド応答などは優先度高
                if (messageContent.includes('接続しました') ||
                    messageContent.includes('入室しました') ||
                    messageContent.includes('退室しました')) {
                    priority = VoiceQueue_1.Priority.HIGH;
                }
                // 長いメッセージやURLが多いメッセージは優先度低
                if (messageContent.length > 100 || messageContent.includes('URL省略')) {
                    priority = VoiceQueue_1.Priority.LOW;
                }
                // キューにメッセージを追加
                if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready) {
                    (0, VoiceQueue_1.enqueueText)(guildId, messageContent, priority, message);
                    console.log(`キューに追加: "${messageContent.substring(0, 30)}..." (優先度: ${priority})`);
                }
                else {
                    console.log(`ボイスクライアントが接続されていません。メッセージを無視します。ギルドID: ${guildId}`);
                }
            }
            else {
                console.log(`ボイスクライアントが接続されていません。メッセージを無視します。ギルドID: ${guildId}`);
            }
            const match = (0, custom_responses_1.findMatchingResponse)(guildId, message.content);
            if (match) {
                // カスタム応答のテキストを生成
                const replyText = (0, custom_responses_1.processResponse)(match, message.content, message.author.username);
                if (message.channel.isTextBased() && 'send' in message.channel) {
                    await message.channel.send(replyText);
                }
                // ボイスチャンネルに接続中ならTTSを試みる
                if (voiceClient && voiceClient.state.status === voice_1.VoiceConnectionStatus.Ready) {
                    try {
                        let audioPath;
                        if ((0, subscription_1.isProFeatureAvailable)(guildId, 'smart-tts')) {
                            audioPath = await (0, smart_tts_1.generateSmartSpeech)(replyText, 888753760, guildId);
                        }
                        else {
                            await (0, TTS_Engine_1.speakVoice)(replyText, 888753760, guildId);
                        }
                    }
                    catch (error) {
                        console.error('カスタム応答TTSエラー:', error);
                    }
                }
            }
        }
        catch (error) {
            console.error(`メッセージの処理中にエラーが発生しました: ${error}`);
            (0, errorLogger_1.logError)('messageProcessError', error instanceof Error ? error : new Error(String(error)));
        }
    });
}
// 古い関数は削除（キュー処理に置き換えたため）
// async function handle_message(message: Message, messageContent: string) { ... }
//# sourceMappingURL=MessageCreate.js.map