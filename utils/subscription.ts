import * as fs from 'fs';
import * as path from 'path';

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

// サブスクリプションデータファイルパス
const PROJECT_ROOT = getProjectRoot();
const SUBSCRIPTION_FILE = path.join(PROJECT_ROOT, 'subscriptions.json');

// サブスクリプションの種類
export enum SubscriptionTier {
    FREE = 'free',
    PRO = 'pro',
    PREMIUM = 'premium'
}

// サブスクリプション情報の型定義
export interface Subscription {
    userId: string;          // Discord User ID
    guildIds: string[];      // 適用するサーバーID一覧
    startDate: string;       // 開始日 (ISO文字列)
    endDate: string;         // 終了日 (ISO文字列)
    tier: SubscriptionTier;  // サブスクリプションのティア
    active: boolean;         // 有効状態
}

// サブスクリプションデータの型定義
interface SubscriptionsData {
    [userId: string]: Subscription;
}

// サブスクリプションデータを読み込む
function loadSubscriptions(): SubscriptionsData {
    try {
        if (fs.existsSync(SUBSCRIPTION_FILE)) {
            const data = fs.readFileSync(SUBSCRIPTION_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('サブスクリプションデータ読み込みエラー:', error);
    }
    return {};
}

// サブスクリプションデータを保存する
function saveSubscriptions(subscriptions: SubscriptionsData): void {
    try {
        // ディレクトリ確認
        const dir = path.dirname(SUBSCRIPTION_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SUBSCRIPTION_FILE, JSON.stringify(subscriptions, null, 2), 'utf8');
    } catch (error) {
        console.error('サブスクリプションデータ保存エラー:', error);
    }
}

// 全てのサブスクリプションデータ
const subscriptions = loadSubscriptions();

// ユーザーのサブスクリプション情報を取得する
export function getUserSubscription(userId: string): Subscription | null {
    const subscription = subscriptions[userId];
    
    if (!subscription) {
        return null;
    }
    
    // 有効期限切れの確認
    if (subscription.active && new Date(subscription.endDate) < new Date()) {
        subscription.active = false;
        saveSubscriptions(subscriptions);
    }
    
    return subscription;
}

// ギルドのサブスクリプション情報を取得する
export function getGuildSubscriptionTier(guildId: string): SubscriptionTier {
    // すべてのサブスクリプションを検索
    for (const userId in subscriptions) {
        const subscription = subscriptions[userId];
        
        // 有効なサブスクリプションで、指定されたギルドが含まれているか確認
        if (subscription.active && subscription.guildIds.includes(guildId)) {
            // 有効期限チェック
            if (new Date(subscription.endDate) >= new Date()) {
                return subscription.tier;
            } else {
                // 期限切れなら更新
                subscription.active = false;
                saveSubscriptions(subscriptions);
            }
        }
    }
    
    // 該当するサブスクリプションがなければFREE
    return SubscriptionTier.FREE;
}

// 新しいサブスクリプションを追加する
export function addSubscription(subscription: Subscription): void {
    subscriptions[subscription.userId] = subscription;
    saveSubscriptions(subscriptions);
}

// サブスクリプションを更新する
export function updateSubscription(userId: string, updates: Partial<Subscription>): boolean {
    if (!subscriptions[userId]) {
        return false;
    }
    
    subscriptions[userId] = {
        ...subscriptions[userId],
        ...updates
    };
    
    saveSubscriptions(subscriptions);
    return true;
}

// サブスクリプションをキャンセルする
export function cancelSubscription(userId: string): boolean {
    if (!subscriptions[userId]) {
        return false;
    }
    
    subscriptions[userId].active = false;
    saveSubscriptions(subscriptions);
    return true;
}

// ギルドの最大音声長さを取得する（Proサブスクリプションによる制限の緩和）
export function getMaxTextLength(guildId: string): number {
    const tier = getGuildSubscriptionTier(guildId);
    
    switch (tier) {
        case SubscriptionTier.PREMIUM:
            return 800; // Premium: 800文字まで
        case SubscriptionTier.PRO:
            return 400; // Pro: 400文字まで
        case SubscriptionTier.FREE:
        default:
            return 200; // Free: 200文字まで
    }
}

// Pro版機能が利用可能かチェック
export function isProFeatureAvailable(guildId: string): boolean {
    const tier = getGuildSubscriptionTier(guildId);
    return tier === SubscriptionTier.PRO || tier === SubscriptionTier.PREMIUM;
}

// Premium版機能が利用可能かチェック
export function isPremiumFeatureAvailable(guildId: string): boolean {
    const tier = getGuildSubscriptionTier(guildId);
    return tier === SubscriptionTier.PREMIUM;
}
