"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveVoiceHistoryItem = saveVoiceHistoryItem;
exports.getVoiceHistory = getVoiceHistory;
exports.getVoiceHistoryByMonth = getVoiceHistoryByMonth;
exports.getVoiceHistoryByTimeRange = getVoiceHistoryByTimeRange;
exports.searchVoiceHistory = searchVoiceHistory;
exports.getUserVoiceHistory = getUserVoiceHistory;
exports.clearVoiceHistory = clearVoiceHistory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const file_utils_1 = require("./file-utils");
// 履歴データのルートディレクトリ
const HISTORY_ROOT = path.join((0, file_utils_1.getProjectRoot)(), 'data', 'history');
/**
 * 音声履歴アイテムを保存する
 */
async function saveVoiceHistoryItem(guildId, item) {
    try {
        // 保存先ディレクトリの確認・作成
        const guildDir = path.join(HISTORY_ROOT, guildId);
        if (!fs.existsSync(guildDir)) {
            fs.mkdirSync(guildDir, { recursive: true });
        }
        // 年月ごとのファイル名を生成
        const date = new Date(item.timestamp);
        const fileName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.json`;
        const filePath = path.join(guildDir, fileName);
        // 既存のデータを読み込むか、新規作成
        let historyData = [];
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            historyData = JSON.parse(fileContent);
        }
        // 新しいアイテムを追加
        historyData.push(item);
        // ファイルに書き込み
        fs.writeFileSync(filePath, JSON.stringify(historyData, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('音声履歴の保存に失敗しました:', error);
        // エラーはログするだけで、呼び出し元には伝播させない
    }
}
/**
 * 特定のギルドの全履歴を取得する (最新のファイルから)
 */
function getVoiceHistory(guildId) {
    try {
        const guildDir = path.join(HISTORY_ROOT, guildId);
        if (!fs.existsSync(guildDir)) {
            return [];
        }
        // ディレクトリ内のすべての履歴ファイルを取得
        const files = fs.readdirSync(guildDir)
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a)); // 降順（最新のファイルから）
        let allHistory = [];
        // 最新の3ファイルまでを読み込む（パフォーマンスのため）
        for (let i = 0; i < Math.min(3, files.length); i++) {
            const filePath = path.join(guildDir, files[i]);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const history = JSON.parse(fileContent);
            allHistory = allHistory.concat(history);
        }
        return allHistory;
    }
    catch (error) {
        console.error('音声履歴の取得に失敗しました:', error);
        return [];
    }
}
/**
 * 指定したギルドの指定年月の音声履歴を取得する
 */
function getVoiceHistoryByMonth(guildId, year, month) {
    try {
        const fileName = `${year}-${String(month).padStart(2, '0')}.json`;
        const filePath = path.join(HISTORY_ROOT, guildId, fileName);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
    }
    catch (error) {
        console.error('音声履歴の取得に失敗しました:', error);
        return [];
    }
}
/**
 * 指定した時間範囲の履歴を取得
 */
function getVoiceHistoryByTimeRange(guildId, startTime, endTime) {
    try {
        const allHistory = getVoiceHistory(guildId);
        return allHistory.filter(item => {
            const itemTime = new Date(item.timestamp);
            return itemTime >= startTime && itemTime <= endTime;
        });
    }
    catch (error) {
        console.error('期間指定履歴の取得に失敗しました:', error);
        return [];
    }
}
/**
 * 履歴から特定のテキストを検索
 */
function searchVoiceHistory(guildId, query) {
    try {
        const allHistory = getVoiceHistory(guildId);
        const lowercaseQuery = query.toLowerCase();
        return allHistory.filter(item => item.text.toLowerCase().includes(lowercaseQuery) ||
            item.username.toLowerCase().includes(lowercaseQuery));
    }
    catch (error) {
        console.error('履歴の検索に失敗しました:', error);
        return [];
    }
}
/**
 * 特定ユーザーの履歴を取得
 */
function getUserVoiceHistory(guildId, userId) {
    try {
        const allHistory = getVoiceHistory(guildId);
        return allHistory.filter(item => item.userId === userId);
    }
    catch (error) {
        console.error('ユーザー履歴の取得に失敗しました:', error);
        return [];
    }
}
/**
 * 履歴を削除
 */
function clearVoiceHistory(guildId) {
    try {
        const guildDir = path.join(HISTORY_ROOT, guildId);
        if (!fs.existsSync(guildDir)) {
            return true; // 既に存在しないので成功とみなす
        }
        const files = fs.readdirSync(guildDir);
        for (const file of files) {
            fs.unlinkSync(path.join(guildDir, file));
        }
        return true;
    }
    catch (error) {
        console.error('履歴の削除に失敗しました:', error);
        return false;
    }
}
//# sourceMappingURL=voiceHistory.js.map