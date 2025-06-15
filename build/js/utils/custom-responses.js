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
exports.loadCustomResponses = loadCustomResponses;
exports.saveCustomResponses = saveCustomResponses;
exports.getCustomResponses = getCustomResponses;
exports.addCustomResponse = addCustomResponse;
exports.removeCustomResponse = removeCustomResponse;
exports.findMatchingResponse = findMatchingResponse;
exports.processResponse = processResponse;
exports.getMaxCustomResponses = getMaxCustomResponses;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const subscription_1 = require("./subscription");
// ギルド別のカスタム応答を保存
const guildResponses = {};
// 最後に応答した時間を記録
const lastResponseTime = {};
// 設定ファイルのパス
const CUSTOM_RESPONSES_FILE = path.join(process.cwd(), 'data', 'custom_responses.json');
// カスタム応答をロード
function loadCustomResponses() {
    try {
        if (fs.existsSync(CUSTOM_RESPONSES_FILE)) {
            const data = fs.readFileSync(CUSTOM_RESPONSES_FILE, 'utf-8');
            const loadedData = JSON.parse(data);
            Object.assign(guildResponses, loadedData);
            console.log('カスタム応答データを読み込みました');
        }
        else {
            console.log('カスタム応答ファイルが見つかりません。新規作成します。');
            saveCustomResponses();
        }
    }
    catch (error) {
        console.error('カスタム応答の読み込みエラー:', error);
    }
}
// カスタム応答を保存
function saveCustomResponses() {
    try {
        fs.writeFileSync(CUSTOM_RESPONSES_FILE, JSON.stringify(guildResponses, null, 2), 'utf-8');
        console.log('カスタム応答データを保存しました');
    }
    catch (error) {
        console.error('カスタム応答の保存エラー:', error);
    }
}
// ギルドのカスタム応答を取得
function getCustomResponses(guildId) {
    return guildResponses[guildId] || [];
}
// カスタム応答を追加
function addCustomResponse(guildId, response) {
    // 最大数チェック
    const maxResponses = getMaxCustomResponses(guildId);
    const currentResponses = guildResponses[guildId] || [];
    if (currentResponses.length >= maxResponses) {
        return null;
    }
    const newResponse = {
        ...response,
        id: generateUniqueId(),
        createdAt: new Date().toISOString()
    };
    if (!guildResponses[guildId]) {
        guildResponses[guildId] = [];
    }
    guildResponses[guildId].push(newResponse);
    saveCustomResponses();
    return newResponse;
}
// カスタム応答を削除
function removeCustomResponse(guildId, responseId) {
    if (!guildResponses[guildId]) {
        return false;
    }
    const initialLength = guildResponses[guildId].length;
    guildResponses[guildId] = guildResponses[guildId].filter(r => r.id !== responseId);
    if (guildResponses[guildId].length < initialLength) {
        saveCustomResponses();
        return true;
    }
    return false;
}
// メッセージにマッチするカスタム応答を取得
function findMatchingResponse(guildId, message) {
    const responses = guildResponses[guildId] || [];
    const now = Date.now();
    // ランダムに順序を入れ替えて処理（同じトリガーが複数ある場合に偏らないようにする）
    const shuffledResponses = [...responses].sort(() => Math.random() - 0.5);
    for (const response of shuffledResponses) {
        // クールダウンチェック
        const lastTime = lastResponseTime[guildId]?.[response.id] || 0;
        if (response.cooldown > 0 && (now - lastTime) < response.cooldown * 1000) {
            continue;
        }
        // 確率チェック
        if (Math.random() * 100 > response.probability) {
            continue;
        }
        // マッチングチェック
        let isMatch = false;
        if (response.isRegex) {
            try {
                const regex = new RegExp(response.trigger, 'i');
                isMatch = regex.test(message);
            }
            catch (e) {
                console.error('正規表現エラー:', e);
            }
        }
        else {
            isMatch = message.toLowerCase().includes(response.trigger.toLowerCase());
        }
        if (isMatch) {
            // 最終応答時間を記録
            if (!lastResponseTime[guildId]) {
                lastResponseTime[guildId] = {};
            }
            lastResponseTime[guildId][response.id] = now;
            return response;
        }
    }
    return null;
}
// 応答を処理（変数置換など）
function processResponse(response, message, username) {
    let processedText = response.response;
    // 基本的な変数置換
    processedText = processedText.replace(/\{user\}/g, username);
    processedText = processedText.replace(/\{time\}/g, new Date().toLocaleTimeString());
    processedText = processedText.replace(/\{date\}/g, new Date().toLocaleDateString());
    // 正規表現キャプチャグループからの置換（正規表現の場合のみ）
    if (response.isRegex) {
        try {
            const regex = new RegExp(response.trigger, 'i');
            const match = message.match(regex);
            if (match && match.length > 1) {
                for (let i = 1; i < match.length; i++) {
                    processedText = processedText.replace(new RegExp(`\\{${i}\\}`, 'g'), match[i] || '');
                }
            }
        }
        catch (e) {
            console.error('正規表現置換エラー:', e);
        }
    }
    return processedText;
}
// サブスクリプションレベルに基づく最大カスタム応答数
function getMaxCustomResponses(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    switch (tier) {
        case subscription_1.SubscriptionType.PREMIUM:
            return 50;
        case subscription_1.SubscriptionType.PRO:
            return 20;
        case subscription_1.SubscriptionType.FREE:
        default:
            return 5;
    }
}
// ユニークID生成
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
// 初期ロード
loadCustomResponses();
//# sourceMappingURL=custom-responses.js.map