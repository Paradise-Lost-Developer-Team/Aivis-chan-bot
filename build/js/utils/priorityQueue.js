"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToQueue = addToQueue;
exports.getNextMessage = getNextMessage;
exports.isProcessing = isProcessing;
exports.setProcessing = setProcessing;
exports.getQueueLength = getQueueLength;
exports.clearQueue = clearQueue;
const pro_features_1 = require("./pro-features");
// サーバーごとの読み上げキュー
const messageQueues = {};
// 各サーバーの処理状態
const processingStatus = {};
/**
 * メッセージを優先度キューに追加する
 */
function addToQueue(message, processedText) {
    const guildId = message.guild?.id;
    if (!guildId)
        return;
    // サーバーごとの優先度を取得
    const basePriority = (0, pro_features_1.getSpeakPriority)(guildId);
    // サーバー管理者は優先度+10
    const isAdmin = message.member?.permissions.has('Administrator') ?? false;
    const adminBonus = isAdmin ? 10 : 0;
    // 最終優先度を算出
    const priority = basePriority + adminBonus;
    const queueItem = {
        message,
        priority,
        timestamp: Date.now(),
        processedText
    };
    // サーバーのキューがなければ初期化
    if (!messageQueues[guildId]) {
        messageQueues[guildId] = [];
    }
    // キューに追加
    messageQueues[guildId].push(queueItem);
    // キューを優先度順にソート（優先度が同じなら先に来たものを優先）
    messageQueues[guildId].sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority; // 優先度の高い順
        }
        return a.timestamp - b.timestamp; // 同じ優先度なら先に来た順
    });
    // まだ処理していなければ処理を開始
    if (!processingStatus[guildId]) {
        processQueue(guildId);
    }
}
/**
 * キューから次のメッセージを取得
 */
function getNextMessage(guildId) {
    if (!messageQueues[guildId] || messageQueues[guildId].length === 0) {
        processingStatus[guildId] = false;
        return null;
    }
    const item = messageQueues[guildId].shift();
    if (!item) {
        processingStatus[guildId] = false;
        return null;
    }
    return {
        message: item.message,
        text: item.processedText
    };
}
/**
 * キューの処理を開始
 */
async function processQueue(guildId) {
    processingStatus[guildId] = true;
    // メッセージ処理関数は外部から注入する必要があるため、
    // メインのMessageCreate.tsから呼び出される関数として使用される
}
/**
 * キューを処理中かどうか
 */
function isProcessing(guildId) {
    return processingStatus[guildId] === true;
}
/**
 * 処理状態を設定
 */
function setProcessing(guildId, status) {
    processingStatus[guildId] = status;
}
/**
 * キューの長さを取得
 */
function getQueueLength(guildId) {
    return messageQueues[guildId]?.length || 0;
}
/**
 * キューの内容をクリア
 */
function clearQueue(guildId) {
    messageQueues[guildId] = [];
    processingStatus[guildId] = false;
}
//# sourceMappingURL=priorityQueue.js.map