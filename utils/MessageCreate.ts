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
            
            // ===== 🔴 重要: 動的テキストチャンネル判定を実行 =====
            const ttsDecision = await shouldPerformTTS(message);
            if (!ttsDecision.shouldTTS) {
                console.log(`[TTS:MessageCreate] メッセージ無視: ${ttsDecision.reason} (guild: ${message.guild.name}, channel: ${channelName})`);
                return;
            }
            
            console.log(`[TTS:MessageCreate] TTS allowed: ${ttsDecision.reason} (guild: ${message.guild.name}, channel: ${channelName})`);
            
            // ===== 以下は既存の TTS 処理 =====
            
            console.log(`[TTS:MessageCreate] Processing message from ${message.author.tag} in ${channelName}`);
            
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
                    console.log(`[TTS:MessageCreate] Using custom response: "${textToSpeak}"`);
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
                        // Get the current speaker ID for the guild (which is a number)
                        const speakerId = currentSpeaker[guildId] || 0;
                        const smartText = await generateSmartSpeech(textToSpeak, speakerId, guildId);
                        if (smartText) {
                            textToSpeak = smartText;
                            console.log(`[TTS:MessageCreate] Using smart TTS: "${textToSpeak}"`);
                        }
                    }
                }
            } catch (error) {
                console.warn(`[TTS:MessageCreate] Smart TTS error:`, error);
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