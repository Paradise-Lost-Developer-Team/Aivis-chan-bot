import * as fs from 'fs';
import * as path from 'path';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from './subscription';

// プロジェクトルートディレクトリを取得
function getProjectRoot(): string {
    const currentDir = __dirname;
    if (currentDir.includes('build/js/utils') || currentDir.includes('build\\js\\utils')) {
        return path.resolve(path.join(currentDir, '..', '..', '..'));
    } else if (currentDir.includes('/utils') || currentDir.includes('\\utils')) {
        return path.resolve(path.join(currentDir, '..'));
    } else {
        return process.cwd();
    }
}

// 履歴データファイルパス
const PROJECT_ROOT = getProjectRoot();
const HISTORY_DIR = path.join(PROJECT_ROOT, 'voiceHistories');

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

// 履歴データを保存
export function saveVoiceHistoryItem(guildId: string, item: VoiceHistoryItem): boolean {
    // Pro版以上でないなら履歴を保存しない
    if (!isProFeatureAvailable(guildId)) {
        return false;
    }
    
    try {
        // ディレクトリ確認
        if (!fs.existsSync(HISTORY_DIR)) {
            fs.mkdirSync(HISTORY_DIR, { recursive: true });
        }
        
        const guildHistoryFile = path.join(HISTORY_DIR, `${guildId}.json`);
        
        // 既存データの読み込み
        let history: VoiceHistoryItem[] = [];
        if (fs.existsSync(guildHistoryFile)) {
            const data = fs.readFileSync(guildHistoryFile, 'utf8');
            history = JSON.parse(data);
        }
        
        // 新しいアイテムを追加
        history.push(item);
        
        // 履歴の長さ制限 (Pro: 100件, Premium: 500件)
        const maxHistoryLength = isPremiumFeatureAvailable(guildId) ? 500 : 100;
        if (history.length > maxHistoryLength) {
            history = history.slice(history.length - maxHistoryLength);
        }
        
        // ファイルに保存
        fs.writeFileSync(guildHistoryFile, JSON.stringify(history, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('履歴保存エラー:', error);
        return false;
    }
}

// 履歴データを取得
export function getVoiceHistory(guildId: string): VoiceHistoryItem[] {
    // Pro版以上でないなら空の履歴を返す
    if (!isProFeatureAvailable(guildId)) {
        return [];
    }
    
    try {
        const guildHistoryFile = path.join(HISTORY_DIR, `${guildId}.json`);
        
        if (!fs.existsSync(guildHistoryFile)) {
            return [];
        }
        
        const data = fs.readFileSync(guildHistoryFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('履歴読み込みエラー:', error);
        return [];
    }
}

// 履歴を検索
export function searchVoiceHistory(guildId: string, query: string): VoiceHistoryItem[] {
    const history = getVoiceHistory(guildId);
    if (!query) return history;
    
    const lowerQuery = query.toLowerCase();
    return history.filter(item => 
        item.text.toLowerCase().includes(lowerQuery) || 
        item.username.toLowerCase().includes(lowerQuery)
    );
}

// 特定ユーザーの履歴を取得
export function getUserVoiceHistory(guildId: string, userId: string): VoiceHistoryItem[] {
    const history = getVoiceHistory(guildId);
    return history.filter(item => item.userId === userId);
}

// 履歴を削除
export function clearVoiceHistory(guildId: string): boolean {
    try {
        const guildHistoryFile = path.join(HISTORY_DIR, `${guildId}.json`);
        
        if (fs.existsSync(guildHistoryFile)) {
            fs.unlinkSync(guildHistoryFile);
        }
        
        return true;
    } catch (error) {
        console.error('履歴削除エラー:', error);
        return false;
    }
}

// 時間範囲で履歴をフィルタリング
export function getVoiceHistoryByTimeRange(
    guildId: string, 
    startTime: Date, 
    endTime: Date
): VoiceHistoryItem[] {
    const history = getVoiceHistory(guildId);
    
    return history.filter(item => {
        const itemTime = new Date(item.timestamp);
        return itemTime >= startTime && itemTime <= endTime;
    });
}
