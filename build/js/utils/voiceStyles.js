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
exports.loadVoiceStyles = loadVoiceStyles;
exports.saveVoiceStyles = saveVoiceStyles;
exports.getGuildStyles = getGuildStyles;
exports.getMaxStylesCount = getMaxStylesCount;
exports.createStyle = createStyle;
exports.deleteStyle = deleteStyle;
exports.applyStyle = applyStyle;
exports.getCurrentStyle = getCurrentStyle;
exports.findStyleByName = findStyleByName;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const subscription_1 = require("./subscription");
const TTS_Engine_1 = require("./TTS-Engine");
// プロジェクトルートディレクトリを取得
function getProjectRoot() {
    const currentDir = __dirname;
    if (currentDir.includes('build/js/utils') || currentDir.includes('build\\js\\utils')) {
        return path.resolve(path.join(currentDir, '..', '..', '..'));
    }
    else if (currentDir.includes('/utils') || currentDir.includes('\\utils')) {
        return path.resolve(path.join(currentDir, '..'));
    }
    else {
        return process.cwd();
    }
}
// 音声スタイル設定ファイルパス
const PROJECT_ROOT = getProjectRoot();
const VOICE_STYLES_FILE = path.join(PROJECT_ROOT, 'voice_styles.json');
// 音声スタイルのデフォルト値
const DEFAULT_STYLE = {
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
let voiceStylesData = {};
// 音声スタイルデータを読み込む
function loadVoiceStyles() {
    try {
        if (fs.existsSync(VOICE_STYLES_FILE)) {
            const data = fs.readFileSync(VOICE_STYLES_FILE, 'utf8');
            const parsed = JSON.parse(data);
            voiceStylesData = parsed;
            return parsed;
        }
    }
    catch (error) {
        console.error('音声スタイルデータ読み込みエラー:', error);
    }
    return {};
}
// 音声スタイルデータを保存する
function saveVoiceStyles() {
    try {
        // ディレクトリ確認
        const dir = path.dirname(VOICE_STYLES_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(VOICE_STYLES_FILE, JSON.stringify(voiceStylesData, null, 2), 'utf8');
    }
    catch (error) {
        console.error('音声スタイルデータ保存エラー:', error);
    }
}
// 初回ロード
loadVoiceStyles();
// サーバーのスタイル一覧を取得
function getGuildStyles(guildId) {
    if (!voiceStylesData[guildId]) {
        voiceStylesData[guildId] = {
            styles: [DEFAULT_STYLE]
        };
        saveVoiceStyles();
    }
    return voiceStylesData[guildId].styles;
}
// サーバーのスタイル最大数を取得
function getMaxStylesCount(guildId) {
    if ((0, subscription_1.isPremiumFeatureAvailable)(guildId, 'voice-style')) {
        return 10; // Premium版は10個まで
    }
    else if ((0, subscription_1.isProFeatureAvailable)(guildId, 'voice-style')) {
        return 3; // Pro版は3個まで
    }
    else {
        return 1; // 無料版は1個（デフォルトのみ）
    }
}
// スタイルを作成
function createStyle(guildId, name, options) {
    // Pro版以上が必要
    if (!(0, subscription_1.isProFeatureAvailable)(guildId, 'voice-style')) {
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
    const premiumOptions = (0, subscription_1.isPremiumFeatureAvailable)(guildId, 'voice-style')
        ? {
            intonation: options.intonation,
            emphasis: options.emphasis,
            formant: options.formant
        }
        : {};
    // 新しいスタイルを作成
    const newStyle = {
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
function deleteStyle(guildId, styleId) {
    if (!voiceStylesData[guildId]) {
        return false;
    }
    // デフォルトスタイルは削除不可
    if (styleId === 'default') {
        return false;
    }
    const initialLength = voiceStylesData[guildId].styles.length;
    voiceStylesData[guildId].styles = voiceStylesData[guildId].styles.filter(style => style.id !== styleId);
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
function applyStyle(guildId, styleId) {
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
    TTS_Engine_1.voiceSettings.volume[guildId] = style.volume;
    TTS_Engine_1.voiceSettings.pitch[guildId] = style.pitch;
    TTS_Engine_1.voiceSettings.speed[guildId] = style.speed;
    // Premium版の追加設定
    if ((0, subscription_1.isPremiumFeatureAvailable)(guildId, 'voice-style')) {
        if (style.intonation !== undefined) {
            TTS_Engine_1.voiceSettings.rate[guildId] = style.intonation;
        }
        if (style.emphasis !== undefined) {
            TTS_Engine_1.voiceSettings.style_strength[guildId] = style.emphasis;
        }
    }
    saveVoiceStyles();
    return style;
}
// 現在適用中のスタイルを取得
function getCurrentStyle(guildId) {
    if (!voiceStylesData[guildId]) {
        return DEFAULT_STYLE;
    }
    const currentId = voiceStylesData[guildId].currentStyleId || 'default';
    return voiceStylesData[guildId].styles.find(s => s.id === currentId) || DEFAULT_STYLE;
}
// スタイルを名前から検索
function findStyleByName(guildId, name) {
    if (!voiceStylesData[guildId]) {
        return null;
    }
    return voiceStylesData[guildId].styles.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
}
//# sourceMappingURL=voiceStyles.js.map