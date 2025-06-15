/**
 * 会話統計用のデータモデル
 */

// ユーザー単位の会話統計
export interface UserConversationStats {
  userId: string;
  username: string;
  totalMessages: number;
  totalCharacters: number;
  totalWords: number;
  totalEmojis: number;
  firstMessageDate: Date;
  lastMessageDate: Date;
  mentionsGiven: number;
  mentionsReceived: number;
  wordFrequency: Map<string, number>;
  emojiFrequency: Map<string, number>;
  hourlyActivity: number[]; // 0-23時の活動量
  weekdayActivity: number[]; // 0-6 (日-土)の活動量
  voiceMinutes: number; // ボイスチャットでの分数
  responseTime: number; // 平均応答時間（ミリ秒）
  reactionCount: number; // 受け取ったリアクション数
  reactionGiven: number; // 送信したリアクション数
  commandUsage: Map<string, number>; // コマンド使用回数
}

// サーバー単位の会話統計
export interface ServerConversationStats {
  serverId: string;
  serverName: string;
  totalMessages: number;
  totalCharacters: number;
  activeUsers: number;
  userStats: Map<string, UserConversationStats>;
  channelStats: Map<string, ChannelStats>;
  hourlyActivity: number[]; // 0-23時の活動量
  weekdayActivity: number[]; // 0-6 (日-土)の活動量
  mostActiveDate?: Date;
  mostActiveUser?: string;
  mostActiveChannel?: string;
  averageMessageLength: number;
  messageDistribution: Map<string, number>; // 日付ごとのメッセージ数
}

// チャンネル単位の統計
export interface ChannelStats {
  channelId: string;
  channelName: string;
  totalMessages: number;
  messageByUsers: Map<string, number>;
  hourlyActivity: number[];
  weekdayActivity: number[];
}

// 時間範囲のフィルター
export interface TimeRangeFilter {
  startDate?: Date;
  endDate?: Date;
}

// 統計APIのレスポンスタイプ
export interface StatsResponse {
  success: boolean;
  data?: any;
  error?: string;
}
