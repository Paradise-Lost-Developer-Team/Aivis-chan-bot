import { adjustAudioQuery, postAudioQuery, postSynthesis } from './TTS-Engine';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { uuidv4 } from './TTS-Engine';

// スマートTTS設定インターフェース
export interface SmartTTSSettings {
    autoBreathing: boolean;      // 自動的な息継ぎを挿入
    sentenceOptimization: boolean; // 文章を最適化（句読点がない場合に追加）
    autoEmotionDetection: boolean; // 文章から感情を検出して適切な声色を選択
    characterVoiceMode: string;  // キャラクター声モード (normal, anime, professional)
}

// デフォルト設定
const DEFAULT_SETTINGS: SmartTTSSettings = {
    autoBreathing: false,
    sentenceOptimization: false,
    autoEmotionDetection: false,
    characterVoiceMode: 'normal'
};

// ギルドごとの設定を保存
const guildSettings: { [guildId: string]: SmartTTSSettings } = {};

/**
 * ギルドの設定を取得
 */
export function getSmartTTSSettings(guildId: string): SmartTTSSettings {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = {...DEFAULT_SETTINGS};
    }
    return guildSettings[guildId];
}

/**
 * ギルドの設定を更新
 */
export function updateSmartTTSSettings(guildId: string, settings: Partial<SmartTTSSettings>): void {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = {...DEFAULT_SETTINGS};
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
export function preprocessText(text: string, settings: SmartTTSSettings): string {
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
        } else if (/(悲しい|泣く|泣き|かなしい|つらい|辛い)/i.test(processedText)) {
            processedText = `<悲しみ>${processedText}</悲しみ>`;
        } else if (/(怒り|ふざけるな|怒った|むかつく|腹立つ)/i.test(processedText)) {
            processedText = `<怒り>${processedText}</怒り>`;
        }
    }
    
    // キャラクター声モードに応じた調整
    if (settings.characterVoiceMode === 'anime') {
        // アニメ風の表現を強調
        processedText = processedText.replace(/(です|ます)([。\.])/g, '$1$2わ');
        processedText = processedText.replace(/(ません)([。\.])/g, '$1$2よ');
    } else if (settings.characterVoiceMode === 'professional') {
        // より丁寧な話し方
        processedText = processedText.replace(/(です)([。\.])/g, 'でございます$2');
        processedText = processedText.replace(/(ます)([。\.])/g, 'ます$2');
    }
    
    return processedText;
}

/**
 * スマートTTSを使って音声ファイルを生成
 */
export async function generateSmartSpeech(text: string, speaker: number, guildId: string): Promise<string> {
    const settings = getSmartTTSSettings(guildId);
    const processedText = preprocessText(text, settings);
    
    console.log(`スマートTTS処理: 元のテキスト "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    console.log(`スマートTTS処理: 処理後 "${processedText.substring(0, 50)}${processedText.length > 50 ? '...' : ''}"`);
    
    try {
        // 声質パラメータをカスタマイズしたaudioQueryを生成
        let audioQuery = await postAudioQuery(processedText, speaker);
        
        // 基本パラメータを調整
        audioQuery = adjustAudioQuery(audioQuery, guildId);
        
        // キャラクター声モードによる調整
        if (settings.characterVoiceMode === 'anime') {
            audioQuery.pitchScale += 0.05;  // 少し高め
            audioQuery.intonationScale = 1.2;  // イントネーション強め
        } else if (settings.characterVoiceMode === 'professional') {
            audioQuery.pitchScale -= 0.02;  // 少し低め
            audioQuery.intonationScale = 0.9;  // イントネーション抑え気味
        }
        
        // 音声生成
        const audioContent = await postSynthesis(audioQuery, speaker);
        const tempAudioFilePath = path.join(os.tmpdir(), `${uuidv4()}.wav`);
        fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent as ArrayBuffer));
        
        return tempAudioFilePath;
    } catch (error) {
        console.error('スマート音声生成エラー:', error);
        throw error;
    }
}
