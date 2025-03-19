import * as fs from 'fs';
import * as path from 'path';
import { isProFeatureAvailable, isPremiumFeatureAvailable } from './subscription';
import { voiceSettings } from './TTS-Engine';

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

// 音声スタイル設定ファイルパス
const PROJECT_ROOT = getProjectRoot();
const VOICE_STYLES_FILE = path.join(PROJECT_ROOT, 'voice_styles.json');

// 音声スタイルの型定義
export interface VoiceStyle {
    id: string;            // スタイルID (自動生成)
    name: string;          // スタイル名
    description?: string;  // スタイルの説明
    volume: number;        // 音量 (0.0-1.0)
    pitch: number;         // ピッチ (-1.0-1.0)
    speed: number;         // 速度 (0.5-2.0)
    intonation?: number;   // 抑揚 (0.0-1.0) - Premium版のみ
    emphasis?: number;     // 強調 (0.0-1.0) - Premium版のみ
    formant?: number;      // フォルマント (-1.0-1.0) - Premium版のみ
    createdBy: string;     // 作成者のユーザーID
    createdAt: string;     // 作成日時
    isDefault?: boolean;   // デフォルトスタイルかどうか
}

// サーバー別の音声スタイルデータ
interface GuildVoiceStyles {
    [guildId: string]: {
        styles: VoiceStyle[];
        currentStyleId?: string;
    };
}

// 音声スタイルのデフォルト値
const DEFAULT_STYLE: VoiceStyle = {
    id: 'default',
    name: 'デフォルト',
    description: '標準的な読み上げスタイル',
    volume: 0.2,
    pitch: 0.0,
    speed: 1.0,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    isDefault: true
};

// 音声スタイルデータ
let voiceStylesData: GuildVoiceStyles = {};

// 音声スタイルデータを読み込む
export function loadVoiceStyles(): GuildVoiceStyles {
    try {
        if (fs.existsSync(VOICE_STYLES_FILE)) {
            const data = fs.readFileSync(VOICE_STYLES_FILE, 'utf8');
            const parsed = JSON.parse(data) as GuildVoiceStyles;
            voiceStylesData = parsed;
            return parsed;
        }
    } catch (error) {
        console.error('音声スタイルデータ読み込みエラー:', error);
    }
    return {};
}

// 音声スタイルデータを保存する
export function saveVoiceStyles(): void {
    try {
        // ディレクトリ確認
        const dir = path.dirname(VOICE_STYLES_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(VOICE_STYLES_FILE, JSON.stringify(voiceStylesData, null, 2), 'utf8');
    } catch (error) {
        console.error('音声スタイルデータ保存エラー:', error);
    }
}

// 初回ロード
loadVoiceStyles();

// サーバーのスタイル一覧を取得
export function getGuildStyles(guildId: string): VoiceStyle[] {
    if (!voiceStylesData[guildId]) {
        voiceStylesData[guildId] = {
            styles: [DEFAULT_STYLE]
        };
        saveVoiceStyles();
    }
    return voiceStylesData[guildId].styles;
}

// サーバーのスタイル最大数を取得
export function getMaxStylesCount(guildId: string): number {
    if (isPremiumFeatureAvailable(guildId)) {
        return 10; // Premium版は10個まで
    } else if (isProFeatureAvailable(guildId)) {
        return 3;  // Pro版は3個まで
    } else {
        return 1;  // 無料版は1個（デフォルトのみ）
    }
}

// スタイルを作成
export function createStyle(
    guildId: string,
    name: string,
    options: {
        description?: string;
        volume?: number;
        pitch?: number;
        speed?: number;
        intonation?: number;
        emphasis?: number;
        formant?: number;
        createdBy: string;
    }
): VoiceStyle | null {
    // Pro版以上が必要
    if (!isProFeatureAvailable(guildId)) {
        return null;
    }
    
    // ギルド初期化
    if (!voiceStylesData[guildId]) {
        voiceStylesData[guildId] = {
            styles: [DEFAULT_STYLE]
        };
    }
    
    // スタイル数の上限チェック
    const maxStyles = getMaxStylesCount(guildId);
    if (voiceStylesData[guildId].styles.length >= maxStyles) {
        return null;
    }
    
    // スタイルIDの生成
    const styleId = `style_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Premium版のみ利用可能な設定をチェック
    const premiumOptions = isPremiumFeatureAvailable(guildId) 
        ? { 
            intonation: options.intonation,
            emphasis: options.emphasis,
            formant: options.formant
        } 
        : {};
    
    // 新しいスタイルを作成
    const newStyle: VoiceStyle = {
        id: styleId,
        name,
        description: options.description,
        volume: options.volume ?? 0.2,
        pitch: options.pitch ?? 0.0,
        speed: options.speed ?? 1.0,
        ...premiumOptions,
        createdBy: options.createdBy,
        createdAt: new Date().toISOString()
    };
    
    // スタイルを追加
    voiceStylesData[guildId].styles.push(newStyle);
    saveVoiceStyles();
    
    return newStyle;
}

// スタイルを削除
export function deleteStyle(guildId: string, styleId: string): boolean {
    if (!voiceStylesData[guildId]) {
        return false;
    }
    
    // デフォルトスタイルは削除不可
    if (styleId === 'default') {
        return false;
    }
    
    const initialLength = voiceStylesData[guildId].styles.length;
    voiceStylesData[guildId].styles = voiceStylesData[guildId].styles.filter(
        style => style.id !== styleId
    );
    
    // 現在選択中のスタイルが削除された場合、デフォルトに戻す
    if (voiceStylesData[guildId].currentStyleId === styleId) {
        voiceStylesData[guildId].currentStyleId = 'default';
    }
    
    const deleted = initialLength > voiceStylesData[guildId].styles.length;
    if (deleted) {
        saveVoiceStyles();
    }
    
    return deleted;
}

// スタイルを適用
export function applyStyle(guildId: string, styleId: string): VoiceStyle | null {
    if (!voiceStylesData[guildId]) {
        return null;
    }
    
    const style = voiceStylesData[guildId].styles.find(s => s.id === styleId);
    if (!style) {
        return null;
    }
    
    // 現在のスタイルを設定
    voiceStylesData[guildId].currentStyleId = styleId;
    
    // 実際の音声設定に適用
    voiceSettings.volume[guildId] = style.volume;
    voiceSettings.pitch[guildId] = style.pitch;
    voiceSettings.speed[guildId] = style.speed;
    
    // Premium版の追加設定
    if (isPremiumFeatureAvailable(guildId)) {
        if (style.intonation !== undefined) {
            voiceSettings.rate[guildId] = style.intonation;
        }
        if (style.emphasis !== undefined) {
            voiceSettings.style_strength[guildId] = style.emphasis;
        }
    }
    
    saveVoiceStyles();
    return style;
}

// 現在適用中のスタイルを取得
export function getCurrentStyle(guildId: string): VoiceStyle | null {
    if (!voiceStylesData[guildId]) {
        return DEFAULT_STYLE;
    }
    
    const currentId = voiceStylesData[guildId].currentStyleId || 'default';
    return voiceStylesData[guildId].styles.find(s => s.id === currentId) || DEFAULT_STYLE;
}

// スタイルを名前から検索
export function findStyleByName(guildId: string, name: string): VoiceStyle | null {
    if (!voiceStylesData[guildId]) {
        return null;
    }
    
    return voiceStylesData[guildId].styles.find(
        s => s.name.toLowerCase() === name.toLowerCase()
    ) || null;
}
