import { Message } from 'discord.js';
import { speakVoice, currentSpeaker, voiceClients, updateLastSpeechTime, chunkText } from './TTS-Engine';
import { VoiceConnectionStatus } from '@discordjs/voice';
import { VoiceHistoryItem, saveVoiceHistoryItem } from './voiceHistory';
import { isProFeatureAvailable } from './subscription';
import { logError } from './errorLogger';

// キューアイテムの優先度
export enum Priority {
    HIGH = 0,     // システム通知など最優先のメッセージ
    NORMAL = 1,   // 通常のユーザーメッセージ
    LOW = 2       // URL内容、長文など優先度の低いメッセージ
}

// キューに格納するアイテムの型
interface QueueItemMetadata {
    userId: string;
    username: string;
    displayName?: string;
    channelId?: string;
    messageId?: string;
    timestamp?: number;
    originalMessage?: Message; // 元のメッセージ（履歴保存用）
}

interface QueueItem {
    guildId: string;
    text: string;
    speakerId: number;
    priority: Priority;
    timestamp: number;
    originalMessage?: Message;  // 元のメッセージ（履歴保存用）
    metadata?: QueueItemMetadata;
}

// ギルドIDごとのキュー
const queues: { [guildId: string]: QueueItem[] } = {};
// 処理中フラグ
const processing: { [guildId: string]: boolean } = {};
// メタデータのデフォルト値を設定
// `createSafeMetadata` accepts a Partial so callers can pass undefined or a partial metadata object.
function createSafeMetadata(metadata?: Partial<QueueItemMetadata>): QueueItemMetadata {
    return {
        userId: metadata?.userId ?? 'system',
        username: metadata?.username ?? 'System',
        displayName: metadata?.displayName ?? metadata?.username ?? 'System',
        channelId: metadata?.channelId ?? '',
        messageId: metadata?.messageId ?? '',
        timestamp: metadata?.timestamp ?? Date.now(),
        originalMessage: metadata?.originalMessage
    };
}
// デフォルトの safeMetadata（必要に応じて enqueue 時に createSafeMetadata を呼ぶ）
const safeMetadata: QueueItemMetadata = createSafeMetadata();

export async function enqueue(guildId: string, text: string, priority: Priority = Priority.NORMAL, metadata?: Partial<QueueItemMetadata>): Promise<void> {
    try {
        const safeMeta = createSafeMetadata(metadata);
        const chunks = chunkText(text);

        // キューが存在しなければ初期化
        if (!queues[guildId]) {
            queues[guildId] = [];
        }
        const queue = queues[guildId];

        // 話者IDの取得（デフォルトはAnneliのノーマル）
        const speakerId = currentSpeaker[guildId] || 888753760;

        for (const chunk of chunks) {
            const item: QueueItem = {
                guildId,
                text: chunk,
                speakerId,
                priority,
                timestamp: Date.now(),
                originalMessage: safeMeta.originalMessage,
                metadata: safeMeta
            };

            // 優先度に基づいてキューに挿入
            let inserted = false;
            for (let i = 0; i < queue.length; i++) {
                if (item.priority < queue[i].priority) {
                    queue.splice(i, 0, item);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                queue.push(item);
            }
        }

        // キューが追加されたら処理を開始
        if (!processing[guildId]) {
            processQueue(guildId);
        }
    } catch (error) {
        console.error(`キューへの追加エラー: ${error}`);
        logError('queueAddError', error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * キューの処理
 */
async function processQueue(guildId: string): Promise<void> {
    // 既に処理中なら終了
    if (processing[guildId]) {
        return;
    }

    // 処理中フラグを立てる
    processing[guildId] = true;

    try {
        while (queues[guildId]?.length > 0) {
            // キューが空になったらループを終了
            if (!queues[guildId] || queues[guildId].length === 0) {
                break;
            }

            // キューから次のアイテムを取り出す
            const item = queues[guildId].shift();
            if (!item) continue;

            // ボイスクライアントのチェック
            const voiceClient = voiceClients[guildId];
            if (!voiceClient || voiceClient.state.status !== 'ready') {
                console.log(`ボイスクライアントが利用できないため、キュー処理をスキップします: ${guildId}`);
                continue;
            }

            try {
                await processQueueItem(guildId, item);
                
                // Pro版ユーザーの場合、履歴に保存
                if (item.originalMessage && isProFeatureAvailable(guildId, 'voice-history')) {
                    try {
                        const historyItem: VoiceHistoryItem = {
                            timestamp: new Date().toISOString(),
                            text: item.text,
                            userId: item.originalMessage.author.id,
                            username: item.originalMessage.member?.displayName || item.originalMessage.author.username,
                            speakerId: item.speakerId,
                            channelId: item.originalMessage.channelId,
                            channelName: item.originalMessage.channel.isTextBased() ? 
                                        (item.originalMessage.channel.isDMBased() ? 'DM' : item.originalMessage.channel.name) : 
                                        '不明なチャンネル'
                        };
                        
                        await saveVoiceHistoryItem(guildId, historyItem);
                    } catch (historyError) {
                        console.error('履歴保存エラー:', historyError);
                    }
                }
            } catch (error) {
                console.error(`キューアイテム処理エラー: ${error}`);
                logError('queueProcessError', error instanceof Error ? error : new Error(String(error)));
                // エラーが発生しても次のアイテムの処理を続行
            }
        }
    } catch (error) {
        console.error(`キュー処理全体エラー: ${error}`);
        logError('queueGeneralError', error instanceof Error ? error : new Error(String(error)));
    } finally {
        // 処理完了フラグを下げる
        processing[guildId] = false;
    }
}

/**
 * キューアイテムの処理
 */
async function processQueueItem(guildId: string, item: QueueItem): Promise<void> {
    try {
        console.log(`キュー処理: "${item.text.substring(0, 30)}..." を再生します (${guildId})`);
        
        // メタデータの安全な取得
        const userId = item.metadata?.userId || 'system';
        const username = item.metadata?.username || 'System';
        
        // メタデータが存在しない場合の警告
        if (!item.metadata) {
            console.warn(`[VoiceQueue] メタデータが存在しません: guildId=${guildId}, text="${item.text.substring(0, 30)}..."`);
        }
        
        await speakVoice(guildId, item.text, userId, username);
        updateLastSpeechTime();
        
        console.log(`✅ キュー処理完了: guildId=${guildId}, user=${username}`);
    } catch (error) {
        console.error(`キューアイテム処理エラー:`, error);
        throw error;
    }
}

/**
 * キューをクリアする
 */
export function clearQueue(guildId: string): number {
    if (!queues[guildId]) {
        return 0;
    }
    
    const count = queues[guildId].length;
    queues[guildId] = [];
    return count;
}

/**
 * キューの状態を取得する
 */
export function getQueueStatus(guildId: string): { length: number; processing: boolean } {
    return {
        length: queues[guildId]?.length || 0,
        processing: processing[guildId] || false
    };
}
