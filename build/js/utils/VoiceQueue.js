"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Priority = void 0;
exports.enqueueText = enqueueText;
exports.clearQueue = clearQueue;
exports.getQueueStatus = getQueueStatus;
const TTS_Engine_1 = require("./TTS-Engine");
const voiceHistory_1 = require("./voiceHistory");
const subscription_1 = require("./subscription");
const errorLogger_1 = require("./errorLogger");
// キューアイテムの優先度
var Priority;
(function (Priority) {
    Priority[Priority["HIGH"] = 0] = "HIGH";
    Priority[Priority["NORMAL"] = 1] = "NORMAL";
    Priority[Priority["LOW"] = 2] = "LOW"; // URL内容、長文など優先度の低いメッセージ
})(Priority || (exports.Priority = Priority = {}));
// ギルドIDごとのキュー
const queues = {};
// 処理中フラグ
const processing = {};
/**
 * テキストをキューに追加する
 */
function enqueueText(guildId, text, priority = Priority.NORMAL, originalMessage) {
    try {
        // キューが存在しなければ初期化
        if (!queues[guildId]) {
            queues[guildId] = [];
        }
        // 話者IDの取得（デフォルトはAnneliのノーマル）
        const speakerId = TTS_Engine_1.currentSpeaker[guildId] || 888753760;
        // キューアイテムの作成
        const item = {
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
    }
    catch (error) {
        console.error(`キューへの追加エラー: ${error}`);
        (0, errorLogger_1.logError)('queueAddError', error instanceof Error ? error : new Error(String(error)));
        return false;
    }
}
/**
 * キューの処理
 */
async function processQueue(guildId) {
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
            if (!item)
                continue;
            // ボイスクライアントのチェック
            const voiceClient = TTS_Engine_1.voiceClients[guildId];
            if (!voiceClient || voiceClient.state.status !== 'ready') {
                console.log(`ボイスクライアントが利用できないため、キュー処理をスキップします: ${guildId}`);
                continue;
            }
            try {
                // 音声を生成
                console.log(`キュー処理: "${item.text.substring(0, 30)}..." を再生します (${guildId})`);
                // originalMessageがあればuserIdを渡す、なければデフォルト話者
                const userId = item.originalMessage?.author.id ?? 'default';
                await (0, TTS_Engine_1.speakVoice)(item.text, userId, guildId);
                // 最終発話時間を更新
                (0, TTS_Engine_1.updateLastSpeechTime)();
                // Pro版ユーザーの場合、履歴に保存
                if (item.originalMessage && (0, subscription_1.isProFeatureAvailable)(guildId, 'voice-history')) {
                    try {
                        const historyItem = {
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
                        await (0, voiceHistory_1.saveVoiceHistoryItem)(guildId, historyItem);
                    }
                    catch (historyError) {
                        console.error('履歴保存エラー:', historyError);
                    }
                }
            }
            catch (error) {
                console.error(`キューアイテム処理エラー: ${error}`);
                (0, errorLogger_1.logError)('queueProcessError', error instanceof Error ? error : new Error(String(error)));
                // エラーが発生しても次のアイテムの処理を続行
            }
        }
    }
    catch (error) {
        console.error(`キュー処理全体エラー: ${error}`);
        (0, errorLogger_1.logError)('queueGeneralError', error instanceof Error ? error : new Error(String(error)));
    }
    finally {
        // 処理完了フラグを下げる
        processing[guildId] = false;
    }
}
/**
 * キューをクリアする
 */
function clearQueue(guildId) {
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
function getQueueStatus(guildId) {
    return {
        length: queues[guildId]?.length || 0,
        processing: processing[guildId] || false
    };
}
//# sourceMappingURL=VoiceQueue.js.map