import { Events, Message, Client, GuildMember, Collection, ChannelType, VoiceChannel, TextChannel } from 'discord.js';
import { voiceClients, loadAutoJoinChannels, MAX_TEXT_LENGTH, speakVoice, speakAnnounce, updateLastSpeechTime, monitorMemoryUsage, getJoinCommandChannel, getTextChannelFromMapByGuild, normalizeTextChannelsMap, textChannelByVoice, currentSpeaker } from './TTS-Engine';
import { AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } from '@discordjs/voice';
import { logError } from './errorLogger';
import { findMatchingResponse, processResponse } from './custom-responses';
import { generateSmartSpeech, getSmartTTSSettings } from './smart-tts';
import { isProFeatureAvailable } from './subscription';

// VoiceQueueを安全にインポート
let enqueueText: any = null;
let Priority: any = null;
try {
    const VoiceQueue = require('./VoiceQueue');
    enqueueText = VoiceQueue.enqueueText;
    Priority = VoiceQueue.Priority;
} catch (error) {
    console.warn('VoiceQueue モジュールが見つかりません。直接読み上げ処理を使用します。');
}

interface ExtendedClient extends Client {
    // Add any additional properties or methods if needed
}

// 追加: ギルドごとにボイス接続状態の初期化済みかどうかを記録するマップ
const voiceInitMap: { [guildId: string]: boolean } = {};

/**
 * 動的テキストチャンネル判定システム（改善版）
 */
const shouldPerformTTS = async (message: Message): Promise<{ shouldTTS: boolean; reason: string }> => {
    const guildId = message.guildId!;
    
    // チャンネル名を安全に取得
    const currentChannelId = message.channel.id;
    const currentChannelName = 'name' in message.channel && message.channel.name 
        ? message.channel.name 
        : 'Unknown Channel';
    
    const voiceClient = voiceClients[guildId];
    
    // 音声接続がない場合は読み上げ不可
    if (!voiceClient || voiceClient.state.status !== VoiceConnectionStatus.Ready) {
        return { shouldTTS: false, reason: 'no-voice-connection' };
    }
    
    try {
        // normalize on module load ensures guildId keys exist where possible
        try { normalizeTextChannelsMap(); } catch (e) {}
        
        // 1. API設定による明示的許可（互換ヘルパーを使用）
        const apiTextChannel = getTextChannelFromMapByGuild(guildId);
        if (apiTextChannel && apiTextChannel.id === currentChannelId) {
            console.log(`[shouldPerformTTS] ✅ Match: API setting (saved: ${apiTextChannel.id}, current: ${currentChannelId})`);
            return { shouldTTS: true, reason: 'api-setting' };
        }
        
        // 2. /joinコマンドを実行したチャンネル
        const joinCommandChannelId = getJoinCommandChannel(guildId);
        if (joinCommandChannelId && joinCommandChannelId === currentChannelId) {
            console.log(`[shouldPerformTTS] ✅ Match: Join command channel (${joinCommandChannelId})`);
            return { shouldTTS: true, reason: 'join-command-channel' };
        }
        
        // 3. ボイスチャンネル内のテキストチャット（直接マッチ）
        const voiceChannelId = voiceClient.joinConfig?.channelId;
        if (voiceChannelId && message.channel.type === ChannelType.GuildVoice) {
            if (currentChannelId === voiceChannelId) {
                console.log(`[shouldPerformTTS] ✅ Match: Voice channel text chat (${currentChannelId})`);
                return { shouldTTS: true, reason: 'voice-channel-text-chat' };
            }
        }
        
        // 3. Botが接続しているボイスチャンネル（関連テキストチャンネル）
        const voiceChannelId2 = voiceClient.joinConfig?.channelId;
        if (voiceChannelId2) {
            const voiceChannel = message.guild?.channels.cache.get(voiceChannelId2) as VoiceChannel;
            
            if (voiceChannel) {
                console.log(`[shouldPerformTTS] Checking voice channel: ${voiceChannel.name} (${voiceChannel.id})`);
                
                // 3a. 明示的なマッピング
                try {
                    const mapped = (textChannelByVoice as any)[voiceChannel.id] as TextChannel | undefined;
                    if (mapped && mapped.id === currentChannelId) {
                        console.log(`[shouldPerformTTS] ✅ Match: Voice-mapped text channel (voice: ${voiceChannel.id}, text: ${mapped.id})`);
                        return { shouldTTS: true, reason: 'voice-mapped-text-channel' };
                    }
                } catch (e) {
                    console.warn(`[shouldPerformTTS] Error checking voice mapping:`, e);
                }

                // 3b. 同じ名前のテキストチャンネル（例: "vc-log" ボイス → "vc-log" テキスト）
                const matchingTextChannel = voiceChannel.parent?.children.cache.find(
                    ch => ch.type === ChannelType.GuildText && ch.name.toLowerCase() === voiceChannel.name.toLowerCase()
                );
                if (matchingTextChannel && matchingTextChannel.id === currentChannelId) {
                    console.log(`[shouldPerformTTS] Found matching text channel by name: ${matchingTextChannel.name} (${matchingTextChannel.id})`);
                    try {
                        const me = message.guild?.members.me || await message.guild?.members.fetch(message.client.user!.id).catch(() => null);
                        const perms = me ? (matchingTextChannel as any).permissionsFor(me) : null;
                        if (!perms || perms.has('SendMessages')) {
                            console.log(`[shouldPerformTTS] ✅ Match: Matching text channel name (voice: ${voiceChannel.name}, text: ${matchingTextChannel.id})`);
                            return { shouldTTS: true, reason: 'matching-text-channel' };
                        } else {
                            console.log(`[shouldPerformTTS] ❌ No permission to send messages in ${matchingTextChannel.name}`);
                        }
                    } catch (e) {
                        console.warn(`[shouldPerformTTS] Error checking permissions:`, e);
                    }
                }
                
                // 3c. ボイスチャンネルと同じカテゴリー内の "chat" や "text" チャンネル
                const chatChannelPatterns = ['chat', 'text', 'general', 'vc-log', 'log'];
                const categoryChannels = voiceChannel.parent?.children.cache.filter(
                    ch => ch.type === ChannelType.GuildText && 
                          chatChannelPatterns.some(pattern => ch.name.toLowerCase().includes(pattern))
                );
                
                if (categoryChannels && categoryChannels.size > 0) {
                    const foundChannel = categoryChannels.find(ch => ch.id === currentChannelId);
                    if (foundChannel) {
                        console.log(`[shouldPerformTTS] ✅ Match: Category chat channel (voice: ${voiceChannel.name}, text: ${foundChannel.name})`);
                        return { shouldTTS: true, reason: 'category-chat-channel' };
                    }
                }
                
                console.log(`[shouldPerformTTS] Voice channel parent: ${voiceChannel.parent?.name || 'none'}, channels in parent: ${voiceChannel.parent?.children.cache.size || 0}`);
            }
        }
        
        // 4. Auto-join設定のフォールバック
        const autoJoinChannelsData = loadAutoJoinChannels();
        if (autoJoinChannelsData[guildId]) {
            console.log(`[shouldPerformTTS] Checking auto-join settings:`, {
                tempVoice: autoJoinChannelsData[guildId].tempVoice,
                isManualTextChannelId: autoJoinChannelsData[guildId].isManualTextChannelId,
                textChannelId: autoJoinChannelsData[guildId].textChannelId
            });
            
            if (autoJoinChannelsData[guildId].tempVoice && !autoJoinChannelsData[guildId].isManualTextChannelId) {
                console.log(`[shouldPerformTTS] ✅ Match: Temp voice auto (allowing all text channels)`);
                return { shouldTTS: true, reason: 'temp-voice-auto' };
            } else if (autoJoinChannelsData[guildId].textChannelId === currentChannelId) {
                console.log(`[shouldPerformTTS] ✅ Match: Auto-join setting (${currentChannelId})`);
                return { shouldTTS: true, reason: 'auto-join-setting' };
            }
        }
        
        console.log(`[shouldPerformTTS] ❌ No match found (guild: ${guildId}, channel: ${currentChannelId})`);
        return { shouldTTS: false, reason: 'no-match' };
        
    } catch (error) {
        console.error(`[shouldPerformTTS] Error in TTS decision:`, error);
        return { shouldTTS: false, reason: 'error' };
    }
};

export function MessageCreate(client: ExtendedClient) {
    client.on('messageCreate', async (message) => {
        try {
            // Bot自身のメッセージは無視
            if (message.author.id === client.user?.id) return;
            
            // DMは無視
            if (!message.guild) return;
            
            // チャンネルの型を確認（GuildText と GuildVoice を処理）
            if (!message.channel || 
                (message.channel.type !== ChannelType.GuildText && 
                 message.channel.type !== ChannelType.GuildVoice)) {
                // 処理対象外のチャンネルタイプは無視
                return;
            }
            
            const guildId = message.guild.id;
            const channelId = message.channel.id;
            
            // チャンネル名の取得（型安全に）- 修正版
            let channelName = 'Unknown Channel';
            try {
                if (message.channel.type === ChannelType.GuildVoice) {
                    // ボイスチャンネルの場合、fetchで最新情報を取得
                    const fetchedChannel = await message.guild.channels.fetch(channelId).catch(() => null);
                    if (fetchedChannel && 'name' in fetchedChannel) {
                        channelName = fetchedChannel.name;
                    } else {
                        channelName = `Voice Channel (${channelId})`;
                    }
                } else if ('name' in message.channel && message.channel.name) {
                    channelName = message.channel.name;
                }
            } catch (e) {
                console.warn(`[TTS:MessageCreate] Failed to get channel name:`, e);
                channelName = `Channel (${channelId})`;
            }
            
            console.log(`[TTS:MessageCreate] Message received in guild: ${message.guild.name} (${guildId}), channel: ${channelName} (${channelId}), type: ${message.channel.type}, author: ${message.author.tag}`);
            
            // ===== 🔴 重要: 動的テキストチャンネル判定を実行（早期実行に変更）=====
            const ttsDecision = await shouldPerformTTS(message);
            if (!ttsDecision.shouldTTS) {
                // Debug info only when there's a voice connection
                const voiceConnection = voiceClients[guildId];
                if (voiceConnection && voiceConnection.state.status === VoiceConnectionStatus.Ready) {
                    console.log(`[TTS:MessageCreate] メッセージ無視: ${ttsDecision.reason} (guild: ${message.guild.name}, channel: ${channelName})`);
                    
                    // デバッグ情報を出力（音声接続があるのに読み上げられない場合のみ）
                    const { voiceSettings, autoJoinChannels } = await import('./TTS-Engine');
                    const settings = voiceSettings[guildId] || {};
                    
                    console.log(`[TTS:DEBUG] Guild settings:`, {
                        textChannelId: settings.textChannelId,
                        voiceChannelId: settings.voiceChannelId,
                        defaultSpeaker: settings.defaultSpeaker,
                        ignoreBotMessages: settings.ignoreBotMessages
                    });
                    
                    try {
                        normalizeTextChannelsMap();
                    } catch (e) {
                        console.warn(`[TTS:DEBUG] Failed to normalize text channels map:`, e);
                    }
                    
                    const savedTextChannel = getTextChannelFromMapByGuild(guildId);
                    const savedTextChannelId = savedTextChannel?.id || null;
                    
                    console.log(`[TTS:DEBUG] Saved text channel: ${savedTextChannelId}, Current: ${channelId}, Match: ${savedTextChannelId === channelId}`);
                    console.log(`[TTS:DEBUG] Join command channel: ${getJoinCommandChannel(guildId)}`);
                    console.log(`[TTS:DEBUG] Voice channel: ${voiceConnection.joinConfig?.channelId}`);
                }
                return;
            }
            
            console.log(`[TTS:MessageCreate] ✅ TTS allowed: ${ttsDecision.reason} (guild: ${message.guild.name}, channel: ${channelName})`);
            
            // ===== 以下は既存の TTS 処理 =====
            
            console.log(`[TTS:MessageCreate] Processing message from ${message.author.tag}: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`);
            
            // メッセージ内容を取得
            let textToSpeak = message.content.trim();
            
            // 空メッセージは無視
            if (!textToSpeak) {
                console.log(`[TTS:MessageCreate] Empty message, skipping TTS`);
                return;
            }
            
            // Bot設定を確認（Botメッセージの無視設定）
            try {
                const autoJoinChannelsData = loadAutoJoinChannels();
                const guildSettings = autoJoinChannelsData[guildId];
                const ignoreBots = guildSettings?.ignoreBots ?? true;
                
                if (ignoreBots && message.author.bot) {
                    console.log(`[TTS:MessageCreate] Ignoring bot message from ${message.author.tag}`);
                    return;
                }
            } catch (error) {
                console.warn(`[TTS:MessageCreate] Failed to check bot ignore setting:`, error);
            }
            
            // カスタムレスポンス機能のチェック
            try {
                const customResponse = await findMatchingResponse(textToSpeak, guildId);
                if (customResponse) {
                    textToSpeak = processResponse(customResponse, textToSpeak, message.author.username);
                    console.log(`[TTS:MessageCreate] Using custom response: "${textToSpeak.substring(0, 50)}..."`);
                }
            } catch (error) {
                console.warn(`[TTS:MessageCreate] Custom response error:`, error);
            }
            
            // スマートTTS機能のチェック（プロ機能）
            try {
                const isProGuild = await isProFeatureAvailable(guildId, 'smart-tts');
                if (isProGuild) {
                    const smartSettings = await getSmartTTSSettings(guildId);
                    if (smartSettings) {
                        try {
                            const speakerId = currentSpeaker[guildId] || 0;
                            const smartText = await generateSmartSpeech(textToSpeak, speakerId, guildId);
                            if (smartText && smartText !== textToSpeak) {
                                textToSpeak = smartText;
                                console.log(`[TTS:MessageCreate] Using smart TTS: "${textToSpeak.substring(0, 50)}..."`);
                            }
                        } catch (smartError) {
                            console.warn(`[TTS:MessageCreate] Smart TTS generation failed, falling back to original text:`, smartError);
                        }
                    }
                }
            } catch (error) {
                console.warn(`[TTS:MessageCreate] Smart TTS check error, continuing with original text:`, error);
            }
            
            // 長すぎるメッセージは切り詰め
            if (textToSpeak.length > MAX_TEXT_LENGTH) {
                textToSpeak = textToSpeak.substring(0, MAX_TEXT_LENGTH) + '... 以下略';
            }
            
            // TTS実行
            if (enqueueText && Priority) {
                try {
                    const guildId = message.guild!.id; // ここで必ず guildId を確定
                    const metadata = {
                        guildId, // ← 追加してキュー側で参照可能に
                        userId: message.author.id,
                        username: message.author.username || message.author.tag,
                        displayName: message.member?.displayName || message.author.username,
                        channelId: message.channel.id,
                        messageId: message.id,
                        timestamp: Date.now()
                    };
                    
                    console.log(`[TTS:MessageCreate] Enqueueing guild=${guildId} channel=${message.channel.id} user=${message.author.id}`);
                    
                    await enqueueText(guildId, textToSpeak, Priority.NORMAL, metadata);
                    console.log(`[TTS:MessageCreate] ✅ Message enqueued for TTS: guild=${guildId}`);
                } catch (enqueueError) {
                    console.error(`[TTS:MessageCreate] Enqueue failed, falling back to direct speak - guild=${message.guild?.id}`, enqueueError);
                    try {
                        // 直接呼ぶ場合も必ず message.guild!.id を渡す
                        await speakVoice(message.guild!.id, textToSpeak, message.author.id, message.author.username || message.author.tag);
                        updateLastSpeechTime();
                        console.log(`[TTS:MessageCreate] ✅ Message spoken directly (fallback) guild=${message.guild?.id}`);
                    } catch (fallbackError) {
                        console.error(`[TTS:MessageCreate] Direct speech fallback also failed:`, fallbackError);
                        logError('ttsCompleteFail', fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
                    }
                }
            } else {
                try {
                    // 直接呼ぶ場合も必ず message.guild!.id を渡す
                    await speakVoice(message.guild!.id, textToSpeak, message.author.id, message.author.username || message.author.tag);
                    updateLastSpeechTime();
                    console.log(`[TTS:MessageCreate] ✅ Message spoken directly guild=${message.guild?.id}`);
                } catch (directError) {
                    console.error(`[TTS:MessageCreate] Direct speech failed:`, directError);
                    logError('directSpeechError', directError instanceof Error ? directError : new Error(String(directError)));
                }
            }

        } catch (error) {
            console.error(`[TTS:MessageCreate] Error processing message:`, error);
            logError('messageCreateError', error instanceof Error ? error : new Error(String(error)));
        }
    });
}

// 古い関数は削除（キュー処理に置き換えたため）
// async function handle_message(message: Message, messageContent: string) { ... }