import * as fs from "fs";
import * as path from "path";
import { getGuildSubscriptionTier, getUserSubscription } from "./subscription";
/**
 * サーバーがProプランまたはPremiumプランかどうかを返す
 * サブスクリプション情報から取得
 */
export function isProPlan(serverId: string): boolean {
    const tier = getGuildSubscriptionTier(serverId) || getUserSubscription(serverId);
    // "pro" または "premium" が対象
    return tier === "pro" || tier === "premium";
}

/**
 * aivmxファイルのアップロード処理
 * @param serverId サーバーID
 * @param file オブジェクト{ name: string, buffer: Buffer }
 * @returns 保存パス
 */
export async function processAivmxUpload(serverId: string, file: { name: string, buffer: Buffer }): Promise<string> {
    // ファイル拡張子チェック
    if (!file.name.toLowerCase().endsWith(".aivmx")) {
        throw new Error("無効なファイル形式です。aivmxファイルのみ受け付けます。");
    }
    
    // サーバーがProプラン以上か判定
    if (!isProPlan(serverId)) {
        throw new Error("このサーバーはProプラン以上の契約が必要です。");
    }
    
    // POST /aivm_models/install をサーバーに送信してレスポンスを得る方式に変更
    const engineUrl = process.env.TTS_SERVICE_URL || process.env.SPEECH_ENGINE_URL || "http://aivisspeech-engine:10101";
    const response = await fetch(`${engineUrl}/aivm_models/install`, {
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
    let speakers: Record<string, any[]> = {};
    try {
        const data = await fs.promises.readFile(speakersPath, "utf8");
        speakers = JSON.parse(data);
    } catch {
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
