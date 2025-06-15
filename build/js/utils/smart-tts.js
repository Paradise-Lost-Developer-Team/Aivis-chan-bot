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
exports.getSmartTTSSettings = getSmartTTSSettings;
exports.updateSmartTTSSettings = updateSmartTTSSettings;
exports.preprocessText = preprocessText;
exports.generateSmartSpeech = generateSmartSpeech;
const TTS_Engine_1 = require("./TTS-Engine");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const TTS_Engine_2 = require("./TTS-Engine");
// デフォルト設定
const DEFAULT_SETTINGS = {
    autoBreathing: false,
    sentenceOptimization: false,
    autoEmotionDetection: false,
    characterVoiceMode: 'normal'
};
// ギルドごとの設定を保存
const guildSettings = {};
/**
 * ギルドの設定を取得
 */
function getSmartTTSSettings(guildId) {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = { ...DEFAULT_SETTINGS };
    }
    return guildSettings[guildId];
}
/**
 * ギルドの設定を更新
 */
function updateSmartTTSSettings(guildId, settings) {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = { ...DEFAULT_SETTINGS };
    }
    guildSettings[guildId] = {
        ...guildSettings[guildId],
        ...settings
    };
    console.log(`サーバーID ${guildId} のスマートTTS設定が更新されました:`, guildSettings[guildId]);
}
/**
 * テキストを前処理してスマートな読み上げ用に最適化
 */
function preprocessText(text, settings) {
    let processedText = text;
    // 文章最適化 - 句読点の適切な配置
    if (settings.sentenceOptimization) {
        // 連続した文章に句読点を追加
        processedText = processedText.replace(/([。．！？\.\!\?])\s*([A-Za-z0-9あ-んア-ン一-龠々])/g, '$1\n$2');
        // 長い文章を適切に分割
        processedText = processedText.replace(/([、,])\s*(?=[^、,]{20,})/g, '$1\n');
    }
    // 自動息継ぎ - 長文で自然な間を挿入
    if (settings.autoBreathing) {
        // <息> タグを挿入
        processedText = processedText.replace(/([。．！？\.\!\?])\s*/g, '$1 <息> ');
        processedText = processedText.replace(/(.{30,40})([、,])(?![^、,]{0,10}[。．！？\.\!\?])/g, '$1$2 <息> ');
    }
    // 感情検出と調整
    if (settings.autoEmotionDetection) {
        // 簡易感情分析
        if (/[！\!]+|[？\?]{2,}|(わーい|やった|すごい|嬉しい)/i.test(processedText)) {
            processedText = `<喜び>${processedText}</喜び>`;
        }
        else if (/(悲しい|泣く|泣き|かなしい|つらい|辛い)/i.test(processedText)) {
            processedText = `<悲しみ>${processedText}</悲しみ>`;
        }
        else if (/(怒り|ふざけるな|怒った|むかつく|腹立つ)/i.test(processedText)) {
            processedText = `<怒り>${processedText}</怒り>`;
        }
    }
    // キャラクター声モードに応じた調整
    if (settings.characterVoiceMode === 'anime') {
        // アニメ風の表現を強調
        processedText = processedText.replace(/(です|ます)([。\.])/g, '$1$2わ');
        processedText = processedText.replace(/(ません)([。\.])/g, '$1$2よ');
    }
    else if (settings.characterVoiceMode === 'professional') {
        // より丁寧な話し方
        processedText = processedText.replace(/(です)([。\.])/g, 'でございます$2');
        processedText = processedText.replace(/(ます)([。\.])/g, 'ます$2');
    }
    return processedText;
}
/**
 * スマートTTSを使って音声ファイルを生成
 */
async function generateSmartSpeech(text, speaker, guildId) {
    const settings = getSmartTTSSettings(guildId);
    const processedText = preprocessText(text, settings);
    console.log(`スマートTTS処理: 元のテキスト "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    console.log(`スマートTTS処理: 処理後 "${processedText.substring(0, 50)}${processedText.length > 50 ? '...' : ''}"`);
    try {
        // 声質パラメータをカスタマイズしたaudioQueryを生成
        let audioQuery = await (0, TTS_Engine_1.postAudioQuery)(processedText, speaker);
        // 基本パラメータを調整
        audioQuery = (0, TTS_Engine_1.adjustAudioQuery)(audioQuery, guildId);
        // キャラクター声モードによる調整
        if (settings.characterVoiceMode === 'anime') {
            audioQuery.pitchScale += 0.05; // 少し高め
            audioQuery.intonationScale = 1.2; // イントネーション強め
        }
        else if (settings.characterVoiceMode === 'professional') {
            audioQuery.pitchScale -= 0.02; // 少し低め
            audioQuery.intonationScale = 0.9; // イントネーション抑え気味
        }
        // 音声生成
        const audioContent = await (0, TTS_Engine_1.postSynthesis)(audioQuery, speaker);
        const tempAudioFilePath = path.join(os.tmpdir(), `${(0, TTS_Engine_2.uuidv4)()}.wav`);
        fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent));
        return tempAudioFilePath;
    }
    catch (error) {
        console.error('スマート音声生成エラー:', error);
        throw error;
    }
}
//# sourceMappingURL=smart-tts.js.map