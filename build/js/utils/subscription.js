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
exports.SubscriptionBenefits = exports.SubscriptionType = void 0;
exports.loadSubscriptions = loadSubscriptions;
exports.saveSubscriptions = saveSubscriptions;
exports.getSubscription = getSubscription;
exports.setSubscription = setSubscription;
exports.checkSubscriptionFeature = checkSubscriptionFeature;
exports.getSubscriptionLimit = getSubscriptionLimit;
exports.getUserSubscription = getUserSubscription;
exports.getGuildSubscriptionTier = getGuildSubscriptionTier;
exports.addSubscription = addSubscription;
exports.updateSubscription = updateSubscription;
exports.cancelSubscription = cancelSubscription;
exports.getMaxTextLength = getMaxTextLength;
exports.isProFeatureAvailable = isProFeatureAvailable;
exports.isPremiumFeatureAvailable = isPremiumFeatureAvailable;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_1 = require("../index");
const errorLogger_1 = require("./errorLogger");
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
var SubscriptionType;
(function (SubscriptionType) {
    SubscriptionType["FREE"] = "free";
    SubscriptionType["PRO"] = "pro";
    SubscriptionType["PREMIUM"] = "premium";
})(SubscriptionType || (exports.SubscriptionType = SubscriptionType = {}));
// サブスクリプションの特典
exports.SubscriptionBenefits = {
    [SubscriptionType.FREE]: {
        maxVoices: 5,
        maxDictionaries: 10,
        maxMessageLength: 200,
        priority: 0
    },
    [SubscriptionType.PRO]: {
        maxVoices: 15,
        maxDictionaries: 50,
        maxMessageLength: 500,
        priority: 1,
        highQualityVoice: true,
        additionalEffects: true
    },
    [SubscriptionType.PREMIUM]: {
        maxVoices: 30,
        maxDictionaries: 999999, // 実質無制限
        maxMessageLength: 1000,
        priority: 2,
        highQualityVoice: true,
        additionalEffects: true,
        exclusiveVoices: true,
        voiceChangeDuringPlayback: true,
        prioritySupport: true,
        textTransformationEffects: true
    }
};
const SUBSCRIPTION_FILE_PATH = path.join(__dirname, '..', 'data', 'subscriptions.json');
// サブスクリプションデータのロード
function loadSubscriptions() {
    try {
        // data ディレクトリが存在しない場合は作成
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        // ファイルが存在しない場合は空のJSONを作成
        if (!fs.existsSync(SUBSCRIPTION_FILE_PATH)) {
            fs.writeFileSync(SUBSCRIPTION_FILE_PATH, JSON.stringify({}, null, 2));
            return {};
        }
        const data = fs.readFileSync(SUBSCRIPTION_FILE_PATH, 'utf8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('サブスクリプションデータ読み込みエラー:', error);
        (0, errorLogger_1.logError)('subscriptionLoadError', error instanceof Error ? error : new Error(String(error)));
        return {};
    }
}
// サブスクリプションデータの保存
function saveSubscriptions(data) {
    try {
        fs.writeFileSync(SUBSCRIPTION_FILE_PATH, JSON.stringify(data, null, 2));
    }
    catch (error) {
        console.error('サブスクリプションデータ保存エラー:', error);
        (0, errorLogger_1.logError)('subscriptionSaveError', error instanceof Error ? error : new Error(String(error)));
    }
}
// サブスクリプションの取得
function getSubscription(guildId) {
    const subscriptions = loadSubscriptions();
    const guildSubscription = subscriptions[guildId];
    // サブスクリプションがない、または期限切れの場合
    if (!guildSubscription || guildSubscription.expiresAt < Date.now()) {
        return SubscriptionType.FREE;
    }
    return guildSubscription.type;
}
// サブスクリプションの設定
function setSubscription(guildId, type, durationDays) {
    const subscriptions = loadSubscriptions();
    subscriptions[guildId] = {
        type,
        expiresAt: Date.now() + (durationDays * 24 * 60 * 60 * 1000)
    };
    saveSubscriptions(subscriptions);
}
// サブスクリプションの特典チェック
function checkSubscriptionFeature(guildId, feature) {
    const subscriptionType = getSubscription(guildId);
    const benefits = exports.SubscriptionBenefits[subscriptionType];
    return feature in benefits && !!benefits[feature];
}
// サブスクリプション数値特典の取得
function getSubscriptionLimit(guildId, limitType) {
    const subscriptionType = getSubscription(guildId);
    const benefits = exports.SubscriptionBenefits[subscriptionType];
    return benefits[limitType] || 0;
}
// BOT作者のユーザーID
const BOT_OWNER_ID = '809627147333140531';
// サブスクリプションデータファイルパス
const PROJECT_ROOT = getProjectRoot();
const SUBSCRIPTION_FILE = path.join(PROJECT_ROOT, 'subscriptions.json');
// サブスクリプションデータを読み込む
function loadSubscriptionsOld() {
    try {
        if (fs.existsSync(SUBSCRIPTION_FILE)) {
            const data = fs.readFileSync(SUBSCRIPTION_FILE, 'utf8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error('サブスクリプションデータ読み込みエラー:', error);
    }
    return {};
}
// サブスクリプションデータを保存する
function saveSubscriptionsOld(subscriptions) {
    try {
        // ディレクトリ確認
        const dir = path.dirname(SUBSCRIPTION_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SUBSCRIPTION_FILE, JSON.stringify(subscriptions, null, 2), 'utf8');
    }
    catch (error) {
        console.error('サブスクリプションデータ保存エラー:', error);
    }
}
// 全てのサブスクリプションデータ
const subscriptions = loadSubscriptionsOld();
// ユーザーのサブスクリプション情報を取得する
function getUserSubscription(userId) {
    const subscription = subscriptions[userId];
    if (!subscription) {
        return null;
    }
    // 有効期限切れの確認
    if (subscription.active && new Date(subscription.endDate) < new Date()) {
        subscription.active = false;
        saveSubscriptionsOld(subscriptions);
    }
    return subscription;
}
// ギルドのサブスクリプション情報を取得する
function getGuildSubscriptionTier(guildId) {
    // Bot製作者が管理するサーバーかどうかを確認
    if (isOwnerGuild(guildId)) {
        console.log(`Bot製作者が管理するサーバー ${guildId} にPremium特権を付与`);
        return SubscriptionType.PREMIUM;
    }
    // 該当するサブスクリプションがなければFREE
    return SubscriptionType.FREE;
}
// 新しいサブスクリプションを追加する
function addSubscription(subscription) {
    subscriptions[subscription.userId] = subscription;
    saveSubscriptionsOld(subscriptions);
}
// サブスクリプションを更新する
function updateSubscription(userId, updates) {
    if (!subscriptions[userId]) {
        return false;
    }
    subscriptions[userId] = {
        ...subscriptions[userId],
        ...updates
    };
    saveSubscriptionsOld(subscriptions);
    return true;
}
// サブスクリプションをキャンセルする
function cancelSubscription(userId) {
    if (!subscriptions[userId]) {
        return false;
    }
    subscriptions[userId].active = false;
    saveSubscriptionsOld(subscriptions);
    return true;
}
// ギルドの最大音声長さを取得する（Proサブスクリプションによる制限の緩和）
function getMaxTextLength(guildId) {
    const tier = getGuildSubscriptionTier(guildId);
    switch (tier) {
        case SubscriptionType.PREMIUM:
            return 800; // Premium: 800文字まで
        case SubscriptionType.PRO:
            return 400; // Pro: 400文字まで
        case SubscriptionType.FREE:
        default:
            return 200; // Free: 200文字まで
    }
}
// Pro版機能が利用可能かチェック
function isProFeatureAvailable(guildId, p0) {
    const tier = getGuildSubscriptionTier(guildId);
    return tier === SubscriptionType.PRO || tier === SubscriptionType.PREMIUM;
}
// Premium版機能が利用可能かチェック
function isPremiumFeatureAvailable(guildId, p0) {
    // 作者が管理するサーバーの場合は常にtrue
    if (isOwnerGuild(guildId)) {
        return true;
    }
    const tier = getGuildSubscriptionTier(guildId);
    return tier === SubscriptionType.PREMIUM;
}
// 指定したギルドがBOT作者の管理下にあるかどうかを確認する
function isOwnerGuild(guildId) {
    try {
        const guild = index_1.client.guilds.cache.get(guildId);
        if (!guild)
            return false;
        // 既存の ownerId を利用する（guild.ownerId は string 型であるための変更）
        const ownerId = guild.ownerId;
        if (ownerId === BOT_OWNER_ID) {
            return true;
        }
        // BOT作者が管理者権限を持っているかチェック
        const ownerMember = guild.members.cache.get(BOT_OWNER_ID);
        if (ownerMember && ownerMember.permissions.has('Administrator')) {
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('オーナーギルドチェックエラー:', error);
        return false;
    }
}
//# sourceMappingURL=subscription.js.map