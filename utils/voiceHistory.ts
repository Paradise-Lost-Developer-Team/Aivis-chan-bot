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
 * 指定したギルドの音声履歴を取得する
 */
export function getVoiceHistory(guildId: string, year: number, month: number): VoiceHistoryItem[] {
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
