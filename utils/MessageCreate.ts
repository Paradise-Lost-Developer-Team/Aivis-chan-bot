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
 * 動的テキストチャンネル判定システム
 * join_channels.jsonに依存せず、現在の状況に基づいてTTSを実行するかを決定
 */
const shouldPerformTTS = async (message: Message): Promise<{ shouldTTS: boolean; reason: string }> => {
    const guildId = message.guildId!;
    const currentChannel = message.channel as TextChannel;
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
        if (apiTextChannel && apiTextChannel.id === currentChannel.id) {
            return { shouldTTS: true, reason: 'api-setting' };
        }
        
        // 2. /joinコマンドを実行したチャンネル
        const joinCommandChannelId = getJoinCommandChannel(guildId);
        if (joinCommandChannelId === currentChannel.id) {
            return { shouldTTS: true, reason: 'join-command-channel' };
        }
        
        // 3. Botが接続しているボイスチャンネル（関連テキストチャンネル）
        const voiceChannelId = voiceClient.joinConfig?.channelId;
        if (voiceChannelId) {
            const voiceChannel = message.guild?.channels.cache.get(voiceChannelId) as VoiceChannel;
            
                if (voiceChannel) {
                    // Strict policy: do NOT allow all channels in the same category.
                    // 1) explicit voice->text mapping
                    try {
                        const mapped = (textChannelByVoice as any)[voiceChannel.id] as TextChannel | undefined;
                        if (mapped && mapped.id === currentChannel.id) return { shouldTTS: true, reason: 'voice-mapped-text-channel' };
                    } catch (e) { /* ignore */ }

                    // 2) same-name text channel only (fallback with permission check)
                    const matchingTextChannel = voiceChannel.parent?.children.cache.find(
                        ch => ch.type === ChannelType.GuildText && ch.name.toLowerCase() === voiceChannel.name.toLowerCase()
                    );
                    if (matchingTextChannel && matchingTextChannel.id === currentChannel.id) {
                        try {
                            const me = message.guild?.members.me || await message.guild?.members.fetch(message.client.user!.id).catch(() => null);
                            const perms = me ? (matchingTextChannel as any).permissionsFor(me) : null;
                            if (!perms || perms.has('SendMessages')) {
                                return { shouldTTS: true, reason: 'matching-text-channel' };
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
        }
        
        // 4. Auto-join設定のフォールバック
        const autoJoinChannelsData = loadAutoJoinChannels();
        if (autoJoinChannelsData[guildId]) {
            if (autoJoinChannelsData[guildId].tempVoice && !autoJoinChannelsData[guildId].isManualTextChannelId) {
                return { shouldTTS: true, reason: 'temp-voice-auto' };
            } else if (autoJoinChannelsData[guildId].textChannelId === currentChannel.id) {
                return { shouldTTS: true, reason: 'auto-join-setting' };
            }
        }
        
        return { shouldTTS: false, reason: 'no-match' };
        
    } catch (error) {
        console.error(`[TTS:1st] 動的判定エラー:`, error);
        return { shouldTTS: false, reason: 'error' };
    }
};

export function MessageCreate(client: ExtendedClient) {
    client.on("messageCreate", async (message) => {
        try {
            // Bot自身のメッセージは無視
            if (message.author.id === client.user?.id) return;
            
            // DMは無視
            if (!message.guild) return;
            
            const guildId = message.guild.id;
            const channelId = message.channel.id;
            
            // チャンネル名を安全に取得（Type Guard使用）
            const channelName = 'name' in message.channel ? message.channel.name : 'Unknown Channel';
            
            console.log(`[TTS:MessageCreate] Message received in guild: ${message.guild.name} (${guildId}), channel: ${channelName} (${channelId})`);
            
            // ボイス接続を確認
            const voiceConnection = voiceClients[guildId];
            if (!voiceConnection) {
                console.log(`[TTS:MessageCreate] No voice connection for guild: ${guildId}`);
                return;
            }
            
            // 接続状態を確認
            if (voiceConnection.state.status !== VoiceConnectionStatus.Ready) {
                console.log(`[TTS:MessageCreate] Voice connection not ready for guild: ${guildId}, status: ${voiceConnection.state.status}`);
                return;
            }
            
            // テキストチャンネルの確認（複数の方法で試行）
            let expectedTextChannelId = getTextChannelFromMapByGuild(guildId)?.id || null;
            
            // 保存されたマッピングがない場合、設定から取得
            if (!expectedTextChannelId) {
                console.log(`[TTS:MessageCreate] No saved text channel mapping for guild: ${guildId}, checking settings...`);
                
                // autoJoinChannels から取得
                const autoJoinChannelsData = loadAutoJoinChannels();
                const autoJoinSetting = autoJoinChannelsData[guildId];
                if (autoJoinSetting?.textChannelId) {
                    expectedTextChannelId = autoJoinSetting.textChannelId;
                    console.log(`[TTS:MessageCreate] Using autoJoin text channel: ${expectedTextChannelId}`);
                }
                
                // joinChannels から取得（既にインポート済みの関数を使用）
                if (!expectedTextChannelId) {
                    const joinCommandChannelId = getJoinCommandChannel(guildId);
                    if (joinCommandChannelId) {
                        expectedTextChannelId = joinCommandChannelId;
                        console.log(`[TTS:MessageCreate] Using join command channel: ${expectedTextChannelId}`);
                    }
                }
                
                // まだ見つからない場合、ボイスチャンネルと同じカテゴリのテキストチャンネルを探す
                if (!expectedTextChannelId) {
                    const voiceChannelId = voiceConnection.joinConfig.channelId;
                    if (voiceChannelId) {
                        const voiceChannel = message.guild.channels.cache.get(voiceChannelId);
                        if (voiceChannel && 'parentId' in voiceChannel && voiceChannel.parentId) {
                            // 同じカテゴリ内のテキストチャンネルを検索
                            const categoryChannels = message.guild.channels.cache.filter(
                                (ch) => ch.type === ChannelType.GuildText && 'parentId' in ch && ch.parentId === voiceChannel.parentId
                            );
                            
                            if (categoryChannels.size > 0) {
                                const firstTextChannel = categoryChannels.first() as TextChannel;
                                expectedTextChannelId = firstTextChannel.id;
                                console.log(`[TTS:MessageCreate] Using category text channel: ${firstTextChannel.name} (${expectedTextChannelId})`);
                            }
                        }
                        
                        // カテゴリが同じでない場合、同名のテキストチャンネルを探す
                        if (!expectedTextChannelId && voiceChannel && 'name' in voiceChannel) {
                            const sameNameChannel = message.guild.channels.cache.find(
                                (ch) => ch.type === ChannelType.GuildText && 'name' in ch && ch.name.toLowerCase() === (voiceChannel as VoiceChannel).name.toLowerCase()
                            ) as TextChannel | undefined;
                            
                            if (sameNameChannel) {
                                expectedTextChannelId = sameNameChannel.id;
                                console.log(`[TTS:MessageCreate] Using same-name text channel: ${sameNameChannel.name} (${expectedTextChannelId})`);
                            }
                        }
                    }
                }
            }
            
            // チャンネルIDが一致するか確認
            if (expectedTextChannelId && channelId !== expectedTextChannelId) {
                console.log(`[TTS:MessageCreate] メッセージ無視: no-match (guild: ${message.guild.name}, channel: ${channelName}, expected: ${expectedTextChannelId}, actual: ${channelId})`);
                return;
            }
            
            // expectedTextChannelId が null の場合、どのテキストチャンネルでも読み上げを許可
            if (!expectedTextChannelId) {
                console.log(`[TTS:MessageCreate] No text channel restriction for guild: ${guildId}, allowing all text channels`);
            }
            
            console.log(`[TTS:MessageCreate] Processing message from ${message.author.tag} in ${channelName}`);
            
            // メッセージ内容を取得
            let textToSpeak = message.content.trim();
            
            // 空メッセージは無視
            if (!textToSpeak) {
                console.log(`[TTS:MessageCreate] Empty message, skipping TTS`);
                return;
            }
            
            // カスタムレスポンス機能のチェック
            const customResponse = await findMatchingResponse(textToSpeak, guildId);
            if (customResponse) {
                textToSpeak = processResponse(customResponse, textToSpeak, message.author.username);
                console.log(`[TTS:MessageCreate] Using custom response: "${textToSpeak}"`);
            }
            
            // スマートTTS機能のチェック（プロ機能）
            const isProGuild = await isProFeatureAvailable(guildId, 'smart-tts');
            if (isProGuild) {
                const smartSettings = await getSmartTTSSettings(guildId);
                if (smartSettings) {
                    // Get the current speaker ID for the guild (which is a number)
                    const speakerId = currentSpeaker[guildId] || 0;
                    const smartText = await generateSmartSpeech(textToSpeak, speakerId, guildId);
                    if (smartText) {
                        textToSpeak = smartText;
                        console.log(`[TTS:MessageCreate] Using smart TTS: "${textToSpeak}"`);
                    }
                }
            }
            
            // 長すぎるメッセージは切り詰め
            if (textToSpeak.length > MAX_TEXT_LENGTH) {
                textToSpeak = textToSpeak.substring(0, MAX_TEXT_LENGTH) + '... 以下略';
            }
            
            // TTS実行
            if (enqueueText && Priority) {
                // キューシステムを使用
                await enqueueText(guildId, textToSpeak, Priority.NORMAL, {
                    userId: message.author.id,
                    username: message.author.username,
                    channelId: message.channel.id
                });
                console.log(`[TTS:MessageCreate] Message enqueued for TTS`);
            } else {
                // 直接読み上げ
                await speakVoice(guildId, textToSpeak, message.author.id, message.author.username);
                updateLastSpeechTime();
                console.log(`[TTS:MessageCreate] Message spoken directly`);
            }

        } catch (error) {
            console.error(`[TTS:MessageCreate] Error processing message:`, error);
            logError('messageCreateError', error instanceof Error ? error : new Error(String(error)));
        }
    });
}

// 古い関数は削除（キュー処理に置き換えたため）
// async function handle_message(message: Message, messageContent: string) { ... }