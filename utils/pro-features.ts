import { VoiceConnection } from '@discordjs/voice';
import { getGuildSubscriptionTier, SubscriptionTier, isProFeatureAvailable, isPremiumFeatureAvailable } from './subscription';
import { speakVoice } from './TTS-Engine';

// Pro版の高度な音声設定
export interface AdvancedVoiceSettings {
    reverbLevel?: number;    // リバーブ効果 (0.0-1.0)
    chorusEffect?: boolean;  // コーラス効果
    pitchVariation?: number; // ピッチ変動 (-1.0-1.0)
    voiceQuality?: 'standard' | 'high' | 'ultra'; // 音声品質
    harmonyLevel?: number;   // 和声レベル (0.0-1.0)
    echoAmount?: number;     // エコー量 (0.0-1.0)
    formantShift?: number;   // フォルマントシフト (-2.0-2.0)
    autoEmotionDetect?: boolean; // 自動感情検出
}

// 音声効果プリセット
export const VOICE_EFFECT_PRESETS = {
    none: {},
    concert: { reverbLevel: 0.7, echoAmount: 0.3 },
    robot: { formantShift: 1.5, pitchVariation: 0.5 },
    whisper: { reverbLevel: 0.2, pitchVariation: -0.3, formantShift: -0.5 },
    stadium: { reverbLevel: 0.9, echoAmount: 0.6 },
    underwater: { formantShift: -1.0, reverbLevel: 0.4 },
    phone: { pitchVariation: 0.2, formantShift: 0.3 },
    chipmunk: { pitchVariation: 0.8, formantShift: 1.0 },
    deep: { pitchVariation: -0.5, formantShift: -0.7 }
};

// サーバーごとのPro設定を保存
const proSettings: { [guildId: string]: AdvancedVoiceSettings } = {};

// Pro版の高度な音声設定を取得
export function getProVoiceSettings(guildId: string): AdvancedVoiceSettings {
    // Pro版ではない場合は空のオブジェクトを返す
    if (!isProFeatureAvailable(guildId)) {
        return {};
    }
    
    // 存在しない場合はデフォルト設定を作成
    if (!proSettings[guildId]) {
        proSettings[guildId] = {
            reverbLevel: 0,
            chorusEffect: false,
            pitchVariation: 0,
            voiceQuality: 'standard',
            harmonyLevel: 0,
            echoAmount: 0,
            formantShift: 0,
            autoEmotionDetect: false
        };
    }
    
    return proSettings[guildId];
}

// Pro版の高度な音声設定を更新
export function updateProVoiceSettings(
    guildId: string, 
    settings: Partial<AdvancedVoiceSettings>
): boolean {
    // Pro版ではない場合は更新不可
    if (!isProFeatureAvailable(guildId)) {
        return false;
    }
    
    // 初期化
    if (!proSettings[guildId]) {
        proSettings[guildId] = {
            reverbLevel: 0,
            chorusEffect: false,
            pitchVariation: 0,
            voiceQuality: 'standard',
            harmonyLevel: 0,
            echoAmount: 0,
            formantShift: 0,
            autoEmotionDetect: false
        };
    }
    
    // 設定を更新
    proSettings[guildId] = {
        ...proSettings[guildId],
        ...settings
    };
    
    return true;
}

// Pro版の特殊効果付き読み上げ
export async function speakWithEffects(
    text: string,
    speaker: number,
    guildId: string,
    effects?: Partial<AdvancedVoiceSettings>
): Promise<string> {
    // Pro版ではない場合は通常の読み上げ
    if (!isProFeatureAvailable(guildId)) {
        return await speakVoice(text, speaker, guildId);
    }
    
    // 使用する効果を取得
    const settingsToUse = effects || getProVoiceSettings(guildId);
    
    // 将来的に効果を適用するコードを実装
    // 現段階では通常の音声を返す
    return await speakVoice(text, speaker, guildId);
}

// Pro版のプラン情報を取得
export function getProPlanInfo(guildId: string): string {
    const tier = getGuildSubscriptionTier(guildId);
    
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return "【Premium】800文字まで読み上げ可能、全ての機能が使用可能、無制限のカスタム辞書";
        case SubscriptionTier.PRO:
            return "【Pro】400文字まで読み上げ可能、高度な音声設定が使用可能、100個までのカスタム辞書";
        case SubscriptionTier.FREE:
        default:
            return "【無料版】200文字まで読み上げ可能、基本機能のみ、30個までのカスタム辞書";
    }
}

// 利用可能なPro版音声モデル一覧を取得
export function getAvailableProVoices(guildId: string): string[] {
    // Premium版の場合
    if (isPremiumFeatureAvailable(guildId)) {
        return [
            "Anneli - ノーマル",
            "Anneli - テンション高め",
            "Anneli - 落ち着き",
            "Anneli - 上機嫌",
            "Anneli - 怒り・悲しみ",
            "Anneli (NSFW) - ノーマル",
            "Premium専用音声1",
            "Premium専用音声2",
            "Premium専用音声3",
            "Premium専用音声4 - ささやき",
            "Premium専用音声5 - 歌声",
            "Premium専用音声6 - ロボット"
        ];
    }
    
    // Pro版の場合
    if (isProFeatureAvailable(guildId)) {
        return [
            "Anneli - ノーマル",
            "Anneli - テンション高め",
            "Anneli - 落ち着き",
            "Anneli - 上機嫌",
            "Anneli - 怒り・悲しみ",
            "Anneli (NSFW) - ノーマル",
            "Pro専用音声1",
            "Pro専用音声2",
            "Pro専用音声3"
        ];
    }
    
    // 無料版の場合
    return [
        "Anneli - ノーマル",
        "Anneli - テンション高め",
        "Anneli - 落ち着き",
        "Anneli - 上機嫌",
        "Anneli - 怒り・悲しみ",
        "Anneli (NSFW) - ノーマル"
    ];
}

// カスタム辞書の最大エントリー数を取得
export function getMaxDictionaryEntries(guildId: string): number {
    const tier = getGuildSubscriptionTier(guildId);
    
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return Infinity; // 無制限
        case SubscriptionTier.PRO:
            return 100; // Pro版は100エントリーまで
        case SubscriptionTier.FREE:
        default:
            return 30; // 無料版は30エントリーまで
    }
}

// 読み上げ優先度を取得 (数字が大きいほど優先度が高い)
export function getSpeakPriority(guildId: string): number {
    const tier = getGuildSubscriptionTier(guildId);
    
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return 100; // Premium版は最優先
        case SubscriptionTier.PRO:
            return 50;  // Pro版は中優先
        case SubscriptionTier.FREE:
        default:
            return 10;  // 無料版は低優先
    }
}

// 音声品質設定の選択肢を取得
export function getAvailableVoiceQualityOptions(guildId: string): string[] {
    const tier = getGuildSubscriptionTier(guildId);
    
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return ['standard', 'high', 'ultra']; // Premiumは全品質利用可能
        case SubscriptionTier.PRO:
            return ['standard', 'high']; // Proは標準と高品質のみ
        case SubscriptionTier.FREE:
        default:
            return ['standard']; // 無料版は標準品質のみ
    }
}

// 音声効果のプリセット選択肢を取得
export function getAvailableVoiceEffectPresets(guildId: string): string[] {
    const tier = getGuildSubscriptionTier(guildId);
    
    if (tier === SubscriptionTier.PREMIUM) {
        // Premiumはすべての効果が利用可能
        return Object.keys(VOICE_EFFECT_PRESETS);
    } else if (tier === SubscriptionTier.PRO) {
        // Proは基本的な効果が利用可能
        return ['none', 'concert', 'robot', 'whisper'];
    } else {
        // 無料版は効果なしのみ
        return ['none'];
    }
}

// 機能の利用可否チェック
export function checkFeatureAvailability(guildId: string): Record<string, boolean> {
    const tier = getGuildSubscriptionTier(guildId);
    
    return {
        advancedVoiceSettings: tier !== SubscriptionTier.FREE,
        customEffects: tier !== SubscriptionTier.FREE,
        voiceHistory: tier !== SubscriptionTier.FREE,
        priorityQueue: tier !== SubscriptionTier.FREE,
        ultrahighQuality: tier === SubscriptionTier.PREMIUM,
        customVoiceStyles: tier === SubscriptionTier.PREMIUM,
        autoPronunciation: tier === SubscriptionTier.PREMIUM,
        bulkDictionary: tier === SubscriptionTier.PREMIUM
    };
}
