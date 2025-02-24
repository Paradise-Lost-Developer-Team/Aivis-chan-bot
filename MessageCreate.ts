import { Events, Message, GatewayIntentBits, Client, TextChannel, ChannelType } from 'discord.js';
import { voiceClients, loadAutoJoinChannels, textChannels, currentSpeaker, speakVoice, getPlayer, createFFmpegAudioSource, MAX_TEXT_LENGTH } from './TTS-Engine'; // Adjust the import path as necessary
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
            let voiceClient = voiceClients[guildId];
            const autoJoinChannelsData = loadAutoJoinChannels();
            console.log(`autoJoinChannelsData = ${JSON.stringify(autoJoinChannelsData)}`);
    
            // 変更箇所：auto join 設定があれば、設定されたテキストチャンネル以外は処理しない
            if (autoJoinChannelsData[guildId]?.textChannelId) {
                if (message.channel.id !== autoJoinChannelsData[guildId].textChannelId) {
                    console.log(`Message is not in the configured text channel (${autoJoinChannelsData[guildId].textChannelId}). Ignoring message. Channel ID: ${message.channel.id}`);
                    return;
                }
            } else {
                // auto join 設定がない場合は、関連のないチャンネルとして処理しない
                console.log(`No auto join configuration for guild ${guildId}. Ignoring message.`);
                return;
            }
    
            // voiceClientが未接続の場合、自動入室設定があれば接続試行
            if (!voiceClient || voiceClient.state.status !== VoiceConnectionStatus.Ready) {
                const guildAutoJoin = autoJoinChannelsData[guildId];
                if (guildAutoJoin && guildAutoJoin.voiceChannelId) {
                    console.log(`Voice client is not connected. Auto joining voice channel ${guildAutoJoin.voiceChannelId}.`);
                    voiceClient = joinVoiceChannel({
                        channelId: guildAutoJoin.voiceChannelId,
                        guildId: guildId,
                        adapterCreator: message.guild!.voiceAdapterCreator as any
                    });
                    voiceClients[guildId] = voiceClient;
                } else {
                    console.log(`No auto join configuration for guild ${guildId}. Proceeding with current channel.`);
                }
            }
    
            let messageContent = message.content;
    
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
    
            // ユーザーメンションを除外
            if (messageContent.match(/<@!\d+>/g)) {
                console.log("Message contains user mention, ignoring.");
                return;
            }
    
            // コードブロック除外
            if (messageContent.match(/```[\s\S]+```/g)) {
                console.log("Message contains code block, ignoring.");
                return;
            }
    
            // マークダウン除外
            if (messageContent.match(/[*_~`]/g)) {
                console.log("Message contains markdown, ignoring.");
                return;
            }
    
            // メッセージ先頭に "(音量0)" がある場合は読み上げを行わない
            if (messageContent.startsWith("(音量0)")) {
                console.log("Message starts with (音量0), ignoring.");
                return;
            }
    
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

    const resource = createFFmpegAudioSource(path);
    const player = getPlayer(guildId);
    if (player) {
        player.play(await resource);
    } else {
        console.error("Error: Audio player is undefined, skipping playback.");
    }
    if (player) {
        voiceClient.subscribe(player);  // プレイヤーをボイスクライアントにサブスクライブ
    } else {
        console.error("Error: Audio player is undefined, cannot subscribe.");
    }
    console.log(`Finished playing message: ${messageContent}`);
}