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
exports.isProPlan = isProPlan;
exports.processAivmxUpload = processAivmxUpload;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const subscription_1 = require("./subscription");
/**
 * サーバーがProプランまたはPremiumプランかどうかを返す
 * サブスクリプション情報から取得
 */
function isProPlan(serverId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(serverId) || (0, subscription_1.getUserSubscription)(serverId);
    // "pro" または "premium" が対象
    return tier === "pro" || tier === "premium";
}
/**
 * aivmxファイルのアップロード処理
 * @param serverId サーバーID
 * @param file オブジェクト{ name: string, buffer: Buffer }
 * @returns 保存パス
 */
async function processAivmxUpload(serverId, file) {
    // ファイル拡張子チェック
    if (!file.name.toLowerCase().endsWith(".aivmx")) {
        throw new Error("無効なファイル形式です。aivmxファイルのみ受け付けます。");
    }
    // サーバーがProプラン以上か判定
    if (!isProPlan(serverId)) {
        throw new Error("このサーバーはProプラン以上の契約が必要です。");
    }
    // POST /aivm_models/install をサーバーに送信してレスポンスを得る方式に変更
    const response = await fetch("http://localhost:10101/aivm_models/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            serverId,
            fileName: file.name,
            fileData: file.buffer.toString("base64")
        })
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || "モデルインストールに失敗しました");
    }
    // speakers.jsonへアップロード情報を書き込み
    const speakersPath = path.join(__dirname, "..", "data", "speakers.json");
    let speakers = {};
    try {
        const data = await fs.promises.readFile(speakersPath, "utf8");
        speakers = JSON.parse(data);
    }
    catch {
        speakers = {};
    }
    if (!speakers[serverId]) {
        speakers[serverId] = [];
    }
    speakers[serverId].push({
        fileName: file.name,
        installedAt: new Date().toISOString()
    });
    await fs.promises.writeFile(speakersPath, JSON.stringify(speakers, null, 2));
    return result.message || "インストール成功";
}
//# sourceMappingURL=proUpload.js.map