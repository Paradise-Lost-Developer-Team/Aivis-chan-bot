import * as fs from 'fs';
import * as path from 'path';
import { getGuildSubscriptionTier, SubscriptionTier } from './subscription';

// カスタム応答のインターフェース
export interface CustomResponse {
    id: string;
    trigger: string;      // トリガーとなるテキスト（正規表現も可能）
    response: string;     // 応答テキスト（変数置換可能）
    isRegex: boolean;     // 正規表現として扱うか
    probability: number;  // 応答確率（0-100）
    cooldown: number;     // クールダウン（秒、0は無制限）
    createdAt: string;    // 作成日時
}

// ギルド別のカスタム応答を保存
const guildResponses: { [guildId: string]: CustomResponse[] } = {};

// 最後に応答した時間を記録
const lastResponseTime: { [guildId: string]: { [responseId: string]: number } } = {};

// 設定ファイルのパス
const CUSTOM_RESPONSES_FILE = path.join(process.cwd(), 'custom_responses.json');

// カスタム応答をロード
export function loadCustomResponses(): void {
    try {
        if (fs.existsSync(CUSTOM_RESPONSES_FILE)) {
            const data = fs.readFileSync(CUSTOM_RESPONSES_FILE, 'utf-8');
            const loadedData = JSON.parse(data);
            Object.assign(guildResponses, loadedData);
            console.log('カスタム応答データを読み込みました');
        } else {
            console.log('カスタム応答ファイルが見つかりません。新規作成します。');
            saveCustomResponses();
        }
    } catch (error) {
        console.error('カスタム応答の読み込みエラー:', error);
    }
}

// カスタム応答を保存
export function saveCustomResponses(): void {
    try {
        fs.writeFileSync(CUSTOM_RESPONSES_FILE, JSON.stringify(guildResponses, null, 2), 'utf-8');
        console.log('カスタム応答データを保存しました');
    } catch (error) {
        console.error('カスタム応答の保存エラー:', error);
    }
}

// ギルドのカスタム応答を取得
export function getCustomResponses(guildId: string): CustomResponse[] {
    return guildResponses[guildId] || [];
}

// カスタム応答を追加
export function addCustomResponse(guildId: string, response: Omit<CustomResponse, 'id' | 'createdAt'>): CustomResponse | null {
    // 最大数チェック
    const maxResponses = getMaxCustomResponses(guildId);
    const currentResponses = guildResponses[guildId] || [];
    
    if (currentResponses.length >= maxResponses) {
        return null;
    }
    
    const newResponse: CustomResponse = {
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
export function removeCustomResponse(guildId: string, responseId: string): boolean {
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
export function findMatchingResponse(guildId: string, message: string): CustomResponse | null {
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
            } catch (e) {
                console.error('正規表現エラー:', e);
            }
        } else {
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
export function processResponse(response: CustomResponse, message: string, username: string): string {
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
        } catch (e) {
            console.error('正規表現置換エラー:', e);
        }
    }
    
    return processedText;
}

// サブスクリプションレベルに基づく最大カスタム応答数
export function getMaxCustomResponses(guildId: string): number {
    const tier = getGuildSubscriptionTier(guildId);
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return 50;
        case SubscriptionTier.PRO:
            return 20;
        case SubscriptionTier.FREE:
        default:
            return 5;
    }
}

// ユニークID生成
function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// 初期ロード
loadCustomResponses();
