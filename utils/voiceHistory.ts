import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from './file-utils';

// 履歴アイテムの型定義
export interface VoiceHistoryItem {
    timestamp: string;
    text: string;
    userId: string;
    username: string;
    speakerId: number;
    channelId: string;
    channelName: string;
}

// 履歴データのルートディレクトリ
const HISTORY_ROOT = path.join(getProjectRoot(), 'data', 'history');

/**
 * 音声履歴アイテムを保存する
 */
export async function saveVoiceHistoryItem(guildId: string, item: VoiceHistoryItem): Promise<void> {
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
        let historyData: VoiceHistoryItem[] = [];
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            historyData = JSON.parse(fileContent);
        }
        
        // 新しいアイテムを追加
        historyData.push(item);
        
        // ファイルに書き込み
        fs.writeFileSync(filePath, JSON.stringify(historyData, null, 2), 'utf-8');
    } catch (error) {
        console.error('音声履歴の保存に失敗しました:', error);
        // エラーはログするだけで、呼び出し元には伝播させない
    }
}

/**
 * 特定のギルドの全履歴を取得する (最新のファイルから)
 */
export function getVoiceHistory(guildId: string): VoiceHistoryItem[] {
    try {
        const guildDir = path.join(HISTORY_ROOT, guildId);
        if (!fs.existsSync(guildDir)) {
            return [];
        }
        
        // ディレクトリ内のすべての履歴ファイルを取得
        const files = fs.readdirSync(guildDir)
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a)); // 降順（最新のファイルから）
        
        let allHistory: VoiceHistoryItem[] = [];
        
        // 最新の3ファイルまでを読み込む（パフォーマンスのため）
        for (let i = 0; i < Math.min(3, files.length); i++) {
            const filePath = path.join(guildDir, files[i]);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const history = JSON.parse(fileContent) as VoiceHistoryItem[];
            allHistory = allHistory.concat(history);
        }
        
        return allHistory;
    } catch (error) {
        console.error('音声履歴の取得に失敗しました:', error);
        return [];
    }
}

/**
 * 指定したギルドの指定年月の音声履歴を取得する
 */
export function getVoiceHistoryByMonth(guildId: string, year: number, month: number): VoiceHistoryItem[] {
    try {
        const fileName = `${year}-${String(month).padStart(2, '0')}.json`;
        const filePath = path.join(HISTORY_ROOT, guildId, fileName);
        
        if (!fs.existsSync(filePath)) {
            return [];
        }
        
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('音声履歴の取得に失敗しました:', error);
        return [];
    }
}

/**
 * 指定した時間範囲の履歴を取得
 */
export function getVoiceHistoryByTimeRange(guildId: string, startTime: Date, endTime: Date): VoiceHistoryItem[] {
    try {
        const allHistory = getVoiceHistory(guildId);
        
        return allHistory.filter(item => {
            const itemTime = new Date(item.timestamp);
            return itemTime >= startTime && itemTime <= endTime;
        });
    } catch (error) {
        console.error('期間指定履歴の取得に失敗しました:', error);
        return [];
    }
}

/**
 * 履歴から特定のテキストを検索
 */
export function searchVoiceHistory(guildId: string, query: string): VoiceHistoryItem[] {
    try {
        const allHistory = getVoiceHistory(guildId);
        const lowercaseQuery = query.toLowerCase();
        
        return allHistory.filter(item => 
            item.text.toLowerCase().includes(lowercaseQuery) || 
            item.username.toLowerCase().includes(lowercaseQuery)
        );
    } catch (error) {
        console.error('履歴の検索に失敗しました:', error);
        return [];
    }
}

/**
 * 特定ユーザーの履歴を取得
 */
export function getUserVoiceHistory(guildId: string, userId: string): VoiceHistoryItem[] {
    try {
        const allHistory = getVoiceHistory(guildId);
        return allHistory.filter(item => item.userId === userId);
    } catch (error) {
        console.error('ユーザー履歴の取得に失敗しました:', error);
        return [];
    }
}

/**
 * 履歴を削除
 */
export function clearVoiceHistory(guildId: string): boolean {
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
    } catch (error) {
        console.error('履歴の削除に失敗しました:', error);
        return false;
    }
}
