/**
 * Aivis Chan Bot - 型定義ファイル
 * プロジェクト全体で使用される型定義をここに集約します
 */

// サーバー設定関連の型定義
interface ServerConfig {
  id: string;
  prefix?: string;
  autoJoin?: boolean;
  defaultVoice?: string;
  enabledEffects?: string[];
  premiumTier?: 'free' | 'pro' | 'premium';
  premiumExpiresAt?: Date;
}

// ユーザー設定関連の型定義
interface UserConfig {
  id: string;
  voice?: string;
  nickname?: string;
  effects?: string[];
  patreonLinked?: boolean;
  patreonTier?: string;
  customDictionary?: CustomDictionaryEntry[];
}

// カスタム辞書エントリ
interface CustomDictionaryEntry {
  word: string;
  reading: string;
  userId?: string;
  serverId?: string;
  isGlobal?: boolean;
}

// TTS設定関連の型定義
interface TTSConfig {
  voice: string;
  speed?: number;
  pitch?: number;
  effects?: string[];
  volume?: number;
}

// 会話トラッキング関連の型定義
interface ConversationStats {
  userId: string;
  guildId: string;
  messageCount: number;
  charactersCount: number;
  lastActiveAt: Date;
  lastChannel?: string;
}

// ボイスチャンネル設定
interface VoiceChannelConfig {
  guildId: string;
  channelId: string;
  autoJoin: boolean;
}

// コマンド関連の型定義
interface Command {
  name: string;
  description: string;
  options?: CommandOption[];
  execute: (interaction: any) => Promise<void>;
}

interface CommandOption {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  choices?: { name: string; value: string }[];
}

// Patreon連携関連の型定義
interface PatreonLink {
  discordId: string;
  patreonId: string;
  tier: string;
  linkedAt: Date;
  benefits: string[];
}

// ボイススタンプ関連の型定義
interface VoiceStamp {
  id: string;
  name: string;
  userId: string;
  guildId: string;
  filePath: string;
  createdAt: Date;
  useCount: number;
  isGlobal: boolean;
  duration: number; // 秒単位
  category?: string;
}

interface VoiceStampCreateOptions {
  name: string;
  userId: string;
  guildId: string;
  audioBuffer: Buffer;
  isGlobal?: boolean;
  category?: string;
}
