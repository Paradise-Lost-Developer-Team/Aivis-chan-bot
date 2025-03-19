import { Message } from 'discord.js';
import { speakVoice, currentSpeaker, voiceClients, play_audio, updateLastSpeechTime } from './TTS-Engine';
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
interface QueueItem {
    guildId: string;
    text: string;
    speakerId: number;
    priority: Priority;
    timestamp: number;
    originalMessage?: Message;  // 元のメッセージ（履歴保存用）
}

// ギルドIDごとのキュー
const queues: { [guildId: string]: QueueItem[] } = {};
// 処理中フラグ
const processing: { [guildId: string]: boolean } = {};

/**
 * テキストをキューに追加する
 */
export function enqueueText(
    guildId: string, 
    text: string, 
    priority: Priority = Priority.NORMAL, 
    originalMessage?: Message
): boolean {
    try {
        // キューが存在しなければ初期化
        if (!queues[guildId]) {
            queues[guildId] = [];
        }

        // 話者IDの取得（デフォルトはAnneliのノーマル）
        const speakerId = currentSpeaker[guildId] || 888753760;

        // キューアイテムの作成
        const item: QueueItem = {
            guildId,
            text,
            speakerId,
            priority,
            timestamp: Date.now(),
            originalMessage
        };

        // 優先度に基づいてキューに挿入
        const queue = queues[guildId];
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

        // キューが追加されたら処理を開始
        if (!processing[guildId]) {
            processQueue(guildId);
        }

        return true;
    } catch (error) {
        console.error(`キューへの追加エラー: ${error}`);
        logError('queueAddError', error instanceof Error ? error : new Error(String(error)));
        return false;
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
                // 音声を生成
                console.log(`キュー処理: "${item.text.substring(0, 30)}..." を再生します (${guildId})`);
                const audioPath = await speakVoice(item.text, item.speakerId, guildId);
                
                // 音声を再生
                await play_audio(voiceClient, audioPath, guildId, null);
                
                // 最終発話時間を更新
                updateLastSpeechTime();

                // Pro版ユーザーの場合、履歴に保存
                if (item.originalMessage && isProFeatureAvailable(guildId)) {
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
