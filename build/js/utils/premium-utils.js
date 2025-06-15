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
exports.PremiumUtils = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const errorLogger_1 = require("./errorLogger");
class PremiumUtils {
    constructor() {
        this.subscriptions = new Map();
        this.premiumFeatures = new Map([
            ['voice-effects', 'pro'],
            ['custom-dictionaries', 'pro'],
            ['conversation-stats', 'premium'],
            ['voice-reminder', 'premium'],
            ['server-analytics', 'premium'],
            ['advanced-tts', 'pro']
        ]);
        this.dataPath = path.join(__dirname, '../data/premium-subscriptions.json');
        this.loadSubscriptions();
    }
    /**
     * シングルトンインスタンスの取得
     */
    static getInstance() {
        if (!PremiumUtils.instance) {
            PremiumUtils.instance = new PremiumUtils();
        }
        return PremiumUtils.instance;
    }
    /**
     * 購読情報の読み込み
     */
    loadSubscriptions() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
                data.forEach((sub) => {
                    const subscription = {
                        ...sub,
                        expiresAt: new Date(sub.expiresAt)
                    };
                    this.subscriptions.set(sub.userId, subscription);
                });
                console.log(`${this.subscriptions.size} 件のプレミアム購読情報を読み込みました`);
            }
        }
        catch (error) {
            console.error('購読情報の読み込みに失敗しました:', error);
            (0, errorLogger_1.logError)('premiumSubscriptionLoadError', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * 購読情報の保存
     */
    saveSubscriptions() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = Array.from(this.subscriptions.values());
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('購読情報の保存に失敗しました:', error);
            (0, errorLogger_1.logError)('premiumSubscriptionSaveError', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * ユーザーの購読情報を取得
     */
    getSubscription(userId) {
        return this.subscriptions.get(userId);
    }
    /**
     * 購読情報を設定/更新
     */
    setSubscription(subscription) {
        this.subscriptions.set(subscription.userId, subscription);
        this.saveSubscriptions();
    }
    /**
     * 機能へのアクセス権をチェック
     */
    checkFeatureAccess(userId, featureName) {
        const subscription = this.getSubscription(userId);
        if (!subscription) {
            return this.createFeatureAccessDenied(featureName);
        }
        // 有効期限切れチェック
        if (subscription.expiresAt < new Date()) {
            return {
                hasAccess: false,
                message: 'プレミアム購読の期限が切れています。更新してください。',
                requiredTier: this.premiumFeatures.get(featureName)
            };
        }
        // 明示的に機能リストに含まれているか
        if (subscription.features.includes(featureName)) {
            return { hasAccess: true };
        }
        // Tierに基づく機能チェック
        const requiredTier = this.premiumFeatures.get(featureName);
        if (!requiredTier) {
            return { hasAccess: true }; // 制限のない機能
        }
        if (requiredTier === 'pro' && (subscription.tier === 'pro' || subscription.tier === 'premium')) {
            return { hasAccess: true };
        }
        if (requiredTier === 'premium' && subscription.tier === 'premium') {
            return { hasAccess: true };
        }
        return this.createFeatureAccessDenied(featureName);
    }
    /**
     * アクセス拒否メッセージの作成
     */
    createFeatureAccessDenied(featureName) {
        const requiredTier = this.premiumFeatures.get(featureName) || 'premium';
        let message = 'この機能はプレミアム会員専用です。';
        if (requiredTier === 'pro') {
            message = 'この機能はPro会員以上で利用可能です。';
        }
        else if (requiredTier === 'premium') {
            message = 'この機能はPremium会員専用です。';
        }
        return {
            hasAccess: false,
            message: `${message} アップグレードについては \`/subscription info\` コマンドをご覧ください。`,
            requiredTier
        };
    }
    /**
     * ユーザーのティアを取得
     */
    getUserTier(userId) {
        const subscription = this.getSubscription(userId);
        if (!subscription || subscription.expiresAt < new Date()) {
            return 'free';
        }
        return subscription.tier;
    }
}
exports.PremiumUtils = PremiumUtils;
//# sourceMappingURL=premium-utils.js.map