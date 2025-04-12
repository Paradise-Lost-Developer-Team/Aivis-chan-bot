import * as fs from 'fs';
import * as path from 'path';
import { logError } from './errorLogger';

export interface PremiumSubscription {
  userId: string;
  tier: 'free' | 'pro' | 'premium';
  features: string[];
  expiresAt: Date;
  patreonLinked: boolean;
}

export interface FeatureAccess {
  hasAccess: boolean;
  message?: string;
  requiredTier?: string;
}

export class PremiumUtils {
  private static instance: PremiumUtils;
  private subscriptions: Map<string, PremiumSubscription> = new Map();
  private dataPath: string;
  private premiumFeatures: Map<string, string> = new Map([
    ['voice-effects', 'pro'],
    ['custom-dictionaries', 'pro'],
    ['conversation-stats', 'premium'],
    ['voice-reminder', 'premium'],
    ['server-analytics', 'premium'],
    ['advanced-tts', 'pro']
  ]);

  constructor() {
    this.dataPath = path.join(__dirname, '../data/premium-subscriptions.json');
    this.loadSubscriptions();
  }

  /**
   * シングルトンインスタンスの取得
   */
  public static getInstance(): PremiumUtils {
    if (!PremiumUtils.instance) {
      PremiumUtils.instance = new PremiumUtils();
    }
    return PremiumUtils.instance;
  }

  /**
   * 購読情報の読み込み
   */
  private loadSubscriptions(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        data.forEach((sub: any) => {
          const subscription: PremiumSubscription = {
            ...sub,
            expiresAt: new Date(sub.expiresAt)
          };
          this.subscriptions.set(sub.userId, subscription);
        });
        console.log(`${this.subscriptions.size} 件のプレミアム購読情報を読み込みました`);
      }
    } catch (error) {
      console.error('購読情報の読み込みに失敗しました:', error);
      logError('premiumSubscriptionLoadError', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 購読情報の保存
   */
  private saveSubscriptions(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = Array.from(this.subscriptions.values());
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('購読情報の保存に失敗しました:', error);
      logError('premiumSubscriptionSaveError', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * ユーザーの購読情報を取得
   */
  public getSubscription(userId: string): PremiumSubscription | undefined {
    return this.subscriptions.get(userId);
  }

  /**
   * 購読情報を設定/更新
   */
  public setSubscription(subscription: PremiumSubscription): void {
    this.subscriptions.set(subscription.userId, subscription);
    this.saveSubscriptions();
  }

  /**
   * 機能へのアクセス権をチェック
   */
  public checkFeatureAccess(userId: string, featureName: string): FeatureAccess {
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
  private createFeatureAccessDenied(featureName: string): FeatureAccess {
    const requiredTier = this.premiumFeatures.get(featureName) || 'premium';
    
    let message = 'この機能はプレミアム会員専用です。';
    if (requiredTier === 'pro') {
      message = 'この機能はPro会員以上で利用可能です。';
    } else if (requiredTier === 'premium') {
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
  public getUserTier(userId: string): 'free' | 'pro' | 'premium' {
    const subscription = this.getSubscription(userId);
    
    if (!subscription || subscription.expiresAt < new Date()) {
      return 'free';
    }
    
    return subscription.tier;
  }
}
