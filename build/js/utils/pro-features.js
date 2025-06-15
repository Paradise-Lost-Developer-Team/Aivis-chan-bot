"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_EFFECT_PRESETS = void 0;
exports.getProVoiceSettings = getProVoiceSettings;
exports.updateProVoiceSettings = updateProVoiceSettings;
exports.getVoiceEffectSettings = getVoiceEffectSettings;
exports.speakWithEffects = speakWithEffects;
exports.getProPlanInfo = getProPlanInfo;
exports.getAvailableProVoices = getAvailableProVoices;
exports.getMaxDictionaryEntries = getMaxDictionaryEntries;
exports.getSpeakPriority = getSpeakPriority;
exports.getAvailableVoiceQualityOptions = getAvailableVoiceQualityOptions;
exports.getAvailableVoiceEffectPresets = getAvailableVoiceEffectPresets;
exports.checkFeatureAvailability = checkFeatureAvailability;
const subscription_1 = require("./subscription");
const TTS_Engine_1 = require("./TTS-Engine");
// サーバーごとのPro設定を保存
const proSettings = {};
// ギルドごとのエフェクト設定を保存するオブジェクト
const guildVoiceEffects = {};
// Pro版の高度な音声設定を取得
function getProVoiceSettings(guildId) {
    // Pro版ではない場合は空のオブジェクトを返す
    if (!(0, subscription_1.isProFeatureAvailable)(guildId, 'voice-settings')) {
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
// エフェクト設定を更新
function updateProVoiceSettings(guildId, effectSettings) {
    console.log(`サーバーID ${guildId} のエフェクト設定を更新:`, effectSettings);
    // none設定の場合は空のオブジェクトを保存
    if (effectSettings.preset === 'none') {
        guildVoiceEffects[guildId] = {};
        console.log(`サーバーID ${guildId} のエフェクトをクリアしました`);
        return;
    }
    guildVoiceEffects[guildId] = {
        ...effectSettings,
        updatedAt: new Date().toISOString()
    };
    console.log(`サーバーID ${guildId} のエフェクト設定が保存されました:`, guildVoiceEffects[guildId]);
}
// エフェクト設定を取得
function getVoiceEffectSettings(guildId) {
    const settings = guildVoiceEffects[guildId] || {};
    console.log(`サーバーID ${guildId} のエフェクト設定を取得:`, settings);
    return settings;
}
// プリセット定義
exports.VOICE_EFFECT_PRESETS = {
    none: {
        preset: 'none'
    },
    concert: {
        preset: 'concert',
        reverbLevel: 0.7, // 0.5から0.7に増加 - より強いリバーブ
        echoAmount: 0.4 // 0.2から0.4に増加
    },
    robot: {
        preset: 'robot',
        formantShift: 0.15, // 0.1から0.15に増加
        echoAmount: 0.3 // 0.2から0.3に増加
    },
    whisper: {
        preset: 'whisper',
        pitchVariation: 0.1,
        echoAmount: 0.15 // 0.05から0.15に増加
    },
    stadium: {
        preset: 'stadium',
        reverbLevel: 0.8, // 0.6から0.8に増加
        echoAmount: 0.5 // 0.3から0.5に増加
    },
    underwater: {
        preset: 'underwater',
        reverbLevel: 0.4, // 0.3から0.4に増加
        echoAmount: 0.6 // 0.4から0.6に増加
    },
    phone: {
        preset: 'phone',
        pitchVariation: 0.1,
        echoAmount: 0.25 // 0.2から0.25に増加
    },
    chipmunk: {
        preset: 'chipmunk',
        pitchVariation: 0.3,
        formantShift: 0.2
    },
    deep: {
        preset: 'deep',
        pitchVariation: -0.2,
        formantShift: -0.1
    }
};
// Pro版の特殊効果付き読み上げ
async function speakWithEffects(text, speaker, guildId, effects) {
    // Pro版ではない場合は通常の読み上げ
    if (!(0, subscription_1.isProFeatureAvailable)(guildId, 'voice-effects')) {
        await (0, TTS_Engine_1.speakVoice)(text, speaker, guildId);
        return;
    }
    // 使用する効果を取得
    const settingsToUse = effects || getProVoiceSettings(guildId);
    // エフェクト適用処理を削除
    await (0, TTS_Engine_1.speakVoice)(text, speaker, guildId);
}
// Pro版のプラン情報を取得
function getProPlanInfo(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    switch (tier) {
        case subscription_1.SubscriptionType.PREMIUM:
            return "【Premium】800文字まで読み上げ可能、全ての機能が使用可能、無制限のカスタム辞書";
        case subscription_1.SubscriptionType.PRO:
            return "【Pro】400文字まで読み上げ可能、高度な音声設定が使用可能、100個までのカスタム辞書";
        case subscription_1.SubscriptionType.FREE:
        default:
            return "【無料版】200文字まで読み上げ可能、基本機能のみ、30個までのカスタム辞書";
    }
}
// 利用可能なPro版音声モデル一覧を取得
function getAvailableProVoices(guildId) {
    // Premium版の場合
    if ((0, subscription_1.isPremiumFeatureAvailable)(guildId, 'premium-voices')) {
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
    if ((0, subscription_1.isProFeatureAvailable)(guildId, 'pro-voices')) {
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
function getMaxDictionaryEntries(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    switch (tier) {
        case subscription_1.SubscriptionType.PREMIUM:
            return Infinity; // 無制限
        case subscription_1.SubscriptionType.PRO:
            return 100; // Pro版は100エントリーまで
        case subscription_1.SubscriptionType.FREE:
        default:
            return 30; // 無料版は30エントリーまで
    }
}
// 読み上げ優先度を取得 (数字が大きいほど優先度が高い)
function getSpeakPriority(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    switch (tier) {
        case subscription_1.SubscriptionType.PREMIUM:
            return 100; // Premium版は最優先
        case subscription_1.SubscriptionType.PRO:
            return 50; // Pro版は中優先
        case subscription_1.SubscriptionType.FREE:
        default:
            return 10; // 無料版は低優先
    }
}
// 音声品質設定の選択肢を取得
function getAvailableVoiceQualityOptions(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    switch (tier) {
        case subscription_1.SubscriptionType.PREMIUM:
            return ['standard', 'high', 'ultra']; // Premiumは全品質利用可能
        case subscription_1.SubscriptionType.PRO:
            return ['standard', 'high']; // Proは標準と高品質のみ
        case subscription_1.SubscriptionType.FREE:
        default:
            return ['standard']; // 無料版は標準品質のみ
    }
}
// 音声効果のプリセット選択肢を取得
function getAvailableVoiceEffectPresets(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    if (tier === subscription_1.SubscriptionType.PREMIUM) {
        // Premiumはすべての効果が利用可能
        return Object.keys(exports.VOICE_EFFECT_PRESETS);
    }
    else if (tier === subscription_1.SubscriptionType.PRO) {
        // Proは基本的な効果が利用可能
        return ['none', 'concert', 'robot', 'whisper'];
    }
    else {
        // 無料版は効果なしのみ
        return ['none'];
    }
}
// 機能の利用可否チェック
function checkFeatureAvailability(guildId) {
    const tier = (0, subscription_1.getGuildSubscriptionTier)(guildId);
    return {
        advancedVoiceSettings: tier !== subscription_1.SubscriptionType.FREE,
        customEffects: tier !== subscription_1.SubscriptionType.FREE,
        voiceHistory: tier !== subscription_1.SubscriptionType.FREE,
        priorityQueue: tier !== subscription_1.SubscriptionType.FREE,
        ultrahighQuality: tier === subscription_1.SubscriptionType.PREMIUM,
        customVoiceStyles: tier === subscription_1.SubscriptionType.PREMIUM,
        autoPronunciation: tier === subscription_1.SubscriptionType.PREMIUM,
        bulkDictionary: tier === subscription_1.SubscriptionType.PREMIUM
    };
}
//# sourceMappingURL=pro-features.js.map