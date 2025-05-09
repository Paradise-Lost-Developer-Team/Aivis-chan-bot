import { Message, Client, VoiceState, MessageReaction, User, PartialMessageReaction, PartialUser, MessageReactionEventDetails } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { UserConversationStats, ServerConversationStats } from './conversation-stats';

interface ChannelStats {
  channelId: string;
  channelName: string;
  totalMessages: number;
  messageByUsers: Map<string, number>;
  hourlyActivity: number[];
  weekdayActivity: number[];
}

import { logError } from './errorLogger';

export class ConversationTrackingService {
  async getUserConversationStats(userId: string): Promise<{ messageCount: number }> {
    let totalMessages = 0;
    // 全サーバーでこのユーザーの統計を集計
    for (const [, userMap] of this.userStats) {
      if (userMap.has(userId)) {
        totalMessages += userMap.get(userId)!.totalMessages;
      }
    }
    return { messageCount: totalMessages };
  }

  /**
   * システム全体の統計を取得
   */
  public async getSystemConversationStats(): Promise<{ totalMessages: number; totalUsers: number; totalGuilds: number }> {
    // 全サーバーのメッセージ総数を集計
    let totalMessages = 0;
    for (const stat of this.serverStats.values()) {
      totalMessages += stat.totalMessages;
    }
    // ユニークユーザー数（キャッシュ上のユーザー数）
    const totalUsers = this.client.users.cache.size;
    // サーバー数（追跡対象のサーバー数）
    const totalGuilds = this.serverStats.size;
    return { totalMessages, totalUsers, totalGuilds };
  }

  private static instance: ConversationTrackingService;
  private client: Client;
  private userStats: Map<string, Map<string, UserConversationStats>> = new Map(); // サーバーID -> ユーザーID -> 統計
  private serverStats: Map<string, ServerConversationStats> = new Map(); // サーバーID -> 統計
  private dataDir: string;
  private saveInterval: NodeJS.Timeout | null = null;
  private voiceTimeTracking: Map<string, Map<string, number>> = new Map(); // サーバーID -> ユーザーID -> 開始時間

  private constructor(client: Client) {
    this.client = client;
    this.dataDir = path.join(__dirname, '../data/conversation-stats');
    
    // データディレクトリの作成
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.loadStats();
    this.setupSaveInterval();
  }

  /**
   * シングルトンインスタンスの取得
   */
  public static getInstance(client: Client): ConversationTrackingService {
    if (!ConversationTrackingService.instance) {
      ConversationTrackingService.instance = new ConversationTrackingService(client);
    }
    return ConversationTrackingService.instance;
  }

  /**
   * イベントリスナーの設定
   */
  public setupEventListeners(): void {
    this.client.on('messageCreate', this.trackMessage.bind(this));
    this.client.on('voiceStateUpdate', this.trackVoiceActivity.bind(this));
    this.client.on('messageReactionAdd', this.trackReactionAdd.bind(this));
  }

  /**
   * メッセージの追跡
   */
  private async trackMessage(message: Message): Promise<void> {
    try {
      // Botのメッセージは除外
      if (message.author.bot) return;
      // DMは除外
      if (!message.guild) return;

      const serverId = message.guild.id;
      const userId = message.author.id;
      const channelId = message.channel.id;
      const content = message.content;

      // サーバー統計の初期化
      if (!this.serverStats.has(serverId)) {
        this.serverStats.set(serverId, this.createInitialServerStats(message.guild.name, serverId));
      }

      // ユーザー統計の初期化
      if (!this.userStats.has(serverId)) {
        this.userStats.set(serverId, new Map());
      }

      const serverUserStats = this.userStats.get(serverId)!;
      if (!serverUserStats.has(userId)) {
        serverUserStats.set(userId, this.createInitialUserStats(userId, message.author.username));
      }

      const serverStat = this.serverStats.get(serverId)!;
      const userStat = serverUserStats.get(userId)!;

      // チャンネル統計の初期化
      if (!serverStat.channelStats.has(channelId)) {
        const channelName = 'name' in message.channel && message.channel.name !== null ? message.channel.name : 'unknown';
        serverStat.channelStats.set(channelId, this.createInitialChannelStats(channelId, channelName));
      }
      const channelStat = serverStat.channelStats.get(channelId)!;

      // メッセージ情報の解析
      const charCount = content.length;
      const wordCount = this.countWords(content);
      const emojiCount = this.countEmojis(content);
      const currentHour = message.createdAt.getHours();
      const currentWeekday = message.createdAt.getDay();
      const mentionsCount = message.mentions.users.size;

      // ユーザー統計の更新
      userStat.totalMessages++;
      userStat.totalCharacters += charCount;
      userStat.totalWords += wordCount;
      userStat.totalEmojis += emojiCount;
      userStat.lastMessageDate = message.createdAt;
      userStat.mentionsGiven += mentionsCount;
      userStat.hourlyActivity[currentHour]++;
      userStat.weekdayActivity[currentWeekday]++;

      // 単語頻度の更新
      const words = content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 2) { // 3文字以上の単語のみカウント
          const count = userStat.wordFrequency.get(word) || 0;
          userStat.wordFrequency.set(word, count + 1);
        }
      });

      // 絵文字頻度の更新
      const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      const emojis = content.match(emojiRegex) || [];
      emojis.forEach(emoji => {
        const count = userStat.emojiFrequency.get(emoji) || 0;
        userStat.emojiFrequency.set(emoji, count + 1);
      });

      // コマンド使用の追跡
      if (content.startsWith('/') || content.startsWith('!')) {
        const commandMatch = content.match(/^[!/](\w+)/);
        if (commandMatch && commandMatch[1]) {
          const command = commandMatch[1].toLowerCase();
          const count = userStat.commandUsage.get(command) || 0;
          userStat.commandUsage.set(command, count + 1);
        }
      }

      // サーバー統計の更新
      serverStat.totalMessages++;
      serverStat.totalCharacters += charCount;
      serverStat.averageMessageLength = serverStat.totalCharacters / serverStat.totalMessages;
      
      // メッセージ配分の更新
      const dateKey = message.createdAt.toISOString().split('T')[0];
      const dateCount = serverStat.messageDistribution.get(dateKey) || 0;
      serverStat.messageDistribution.set(dateKey, dateCount + 1);
      
      // 最もアクティブなユーザー/チャンネルの更新
      if (!serverStat.mostActiveUser || 
          serverUserStats.get(serverStat.mostActiveUser)!.totalMessages < userStat.totalMessages) {
        serverStat.mostActiveUser = userId;
      }
      
      if (!serverStat.mostActiveChannel || 
          serverStat.channelStats.get(serverStat.mostActiveChannel)!.totalMessages < channelStat.totalMessages) {
        serverStat.mostActiveChannel = channelId;
      }
      
      // 時間帯・曜日ごとの活動量
      serverStat.hourlyActivity[currentHour]++;
      serverStat.weekdayActivity[currentWeekday]++;
      
      // チャンネル統計の更新
      channelStat.totalMessages++;
      const prev = channelStat.messageByUsers.get(userId) ?? 0;
      channelStat.messageByUsers.set(userId, prev + 1);
      channelStat.hourlyActivity[currentHour]++;
      channelStat.weekdayActivity[currentWeekday]++;
      
      // メンション受信の更新
      message.mentions.users.forEach(mentionedUser => {
        if (mentionedUser.id === this.client.user!.id) return; // Botへのメンションは除外
        
        if (serverUserStats.has(mentionedUser.id)) {
          const mentionedUserStat = serverUserStats.get(mentionedUser.id)!;
          mentionedUserStat.mentionsReceived++;
        }
      });

      // 頻繁な保存は避け、メモリに保持
      // 定期的な保存は setupSaveInterval で実施
    } catch (error) {
      console.error('会話追跡エラー:', error);
      logError('conversationTrackingError', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * ボイスアクティビティの追跡
   */
  private trackVoiceActivity(oldState: VoiceState, newState: VoiceState): void {
    try {
      const userId = newState.member?.user.id;
      if (!userId || newState.member?.user.bot) return;
      
      const serverId = newState.guild.id;
      
      // ボイスチャンネル入室: 時間の記録開始
      if (!oldState.channel && newState.channel) {
        if (!this.voiceTimeTracking.has(serverId)) {
          this.voiceTimeTracking.set(serverId, new Map());
        }
        this.voiceTimeTracking.get(serverId)!.set(userId, Date.now());
      }
      
      // ボイスチャンネル退室: 時間を計算して統計に追加
      else if (oldState.channel && !newState.channel) {
        if (this.voiceTimeTracking.has(serverId) && this.voiceTimeTracking.get(serverId)!.has(userId)) {
          const startTime = this.voiceTimeTracking.get(serverId)!.get(userId)!;
          const durationMinutes = (Date.now() - startTime) / 60000;
          
          // ユーザー統計の更新
          if (this.userStats.has(serverId) && this.userStats.get(serverId)!.has(userId)) {
            const userStat = this.userStats.get(serverId)!.get(userId)!;
            userStat.voiceMinutes += durationMinutes;
          }
          
          // 時間追跡から削除
          this.voiceTimeTracking.get(serverId)!.delete(userId);
        }
      }
    } catch (error) {
      console.error('ボイス追跡エラー:', error);
      logError('voiceTrackingError', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * リアクションの追跡
   */
  private async trackReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, details: MessageReactionEventDetails): Promise<void> {
    try {
      if (user.bot) return;
      if (!reaction.message.guild) return;
      
      const serverId = reaction.message.guild.id;
      const userId = user.id;
      const targetUserId = reaction.message.author?.id;
      
      // リアクション送信者の統計更新
      if (this.userStats.has(serverId) && this.userStats.get(serverId)!.has(userId)) {
        const userStat = this.userStats.get(serverId)!.get(userId)!;
        userStat.reactionGiven++;
      }
      
      // リアクション受信者の統計更新
      if (targetUserId && this.userStats.has(serverId) && this.userStats.get(serverId)!.has(targetUserId)) {
        const targetUserStat = this.userStats.get(serverId)!.get(targetUserId)!;
        targetUserStat.reactionCount++;
      }
    } catch (error) {
      console.error('リアクション追跡エラー:', error);
      logError('reactionTrackingError', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 定期保存の設定
   */
  private setupSaveInterval(): void {
    // 15分ごとに保存
    this.saveInterval = setInterval(() => {
      this.saveStats();
    }, 15 * 60 * 1000);
  }

  /**
   * 統計データの保存
   */
  public saveStats(): void {
    try {
      // サーバー統計の保存
      for (const [serverId, stats] of this.serverStats.entries()) {
        const serverStatsPath = path.join(this.dataDir, `server_${serverId}.json`);
        
        // MapオブジェクトをJSON用に変換
        const jsonStats = {
          ...stats,
          channelStats: Array.from(stats.channelStats.entries()),
          messageDistribution: Array.from(stats.messageDistribution.entries())
        };
        
        fs.writeFileSync(serverStatsPath, JSON.stringify(jsonStats, null, 2));
      }
      
      // ユーザー統計の保存
      for (const [serverId, userMap] of this.userStats.entries()) {
        const userStatsPath = path.join(this.dataDir, `users_${serverId}.json`);
        
        // MapオブジェクトをJSON用に変換
        const jsonUsers = Array.from(userMap.entries()).map(([userId, stats]) => {
          return [
            userId,
            {
              ...stats,
              wordFrequency: Array.from(stats.wordFrequency.entries()),
              emojiFrequency: Array.from(stats.emojiFrequency.entries()),
              commandUsage: Array.from(stats.commandUsage.entries())
            }
          ];
        });
        
        fs.writeFileSync(userStatsPath, JSON.stringify(jsonUsers, null, 2));
      }
      
      console.log('会話統計データを保存しました');
    } catch (error) {
      console.error('会話統計データ保存エラー:', error);
      logError('statsDataSaveError', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 統計データの読み込み
   */
  private loadStats(): void {
    try {
      // サーバー統計の読み込み
      const serverFiles = fs.readdirSync(this.dataDir).filter(file => file.startsWith('server_'));
      
      for (const file of serverFiles) {
        try {
          const filePath = path.join(this.dataDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const serverId = file.replace('server_', '').replace('.json', '');
          
          // JSONから元のMapオブジェクトに変換
          const serverStat: ServerConversationStats = {
            ...data,
            channelStats: new Map(data.channelStats),
            messageDistribution: new Map(data.messageDistribution)
          };
          
          // 日付型の復元
          if (serverStat.mostActiveDate) {
            serverStat.mostActiveDate = new Date(serverStat.mostActiveDate);
          }
          
          // messageByUsers を Map に変換
          for (const [, channelStat] of serverStat.channelStats) {
            if (!(channelStat.messageByUsers instanceof Map)) {
              channelStat.messageByUsers = new Map(
                Object.entries(channelStat.messageByUsers || {})
              );
            }
          }
          
          this.serverStats.set(serverId, serverStat);
        } catch (innerError) {
          console.error(`ファイル ${file} の読み込みエラー:`, innerError);
        }
      }
      
      // ユーザー統計の読み込み
      const userFiles = fs.readdirSync(this.dataDir).filter(file => file.startsWith('users_'));
      
      for (const file of userFiles) {
        try {
          const filePath = path.join(this.dataDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const serverId = file.replace('users_', '').replace('.json', '');
          
          const userMap = new Map();
          
          // JSONから元のMapオブジェクトに変換
          for (const [userId, userData] of data) {
            const userStat: UserConversationStats = {
              ...userData,
              wordFrequency: new Map(userData.wordFrequency),
              emojiFrequency: new Map(userData.emojiFrequency),
              commandUsage: new Map(userData.commandUsage || [])
            };
            
            // 日付型の復元
            userStat.firstMessageDate = new Date(userStat.firstMessageDate);
            userStat.lastMessageDate = new Date(userStat.lastMessageDate);
            
            userMap.set(userId, userStat);
          }
          
          this.userStats.set(serverId, userMap);
        } catch (innerError) {
          console.error(`ファイル ${file} の読み込みエラー:`, innerError);
        }
      }
      
      console.log('会話統計データを読み込みました');
    } catch (error) {
      console.error('統計データ読み込みエラー:', error);
      // 初回実行時はファイルが存在しない可能性があるため、エラーログは最小限に
      if (!(error instanceof Error && error.message.includes('no such file or directory'))) {
        logError('statsDataLoadError', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * 初期ユーザー統計オブジェクトの作成
   */
  private createInitialUserStats(userId: string, username: string): UserConversationStats {
    return {
      userId,
      username,
      totalMessages: 0,
      totalCharacters: 0,
      totalWords: 0,
      totalEmojis: 0,
      firstMessageDate: new Date(),
      lastMessageDate: new Date(),
      mentionsGiven: 0,
      mentionsReceived: 0,
      wordFrequency: new Map(),
      emojiFrequency: new Map(),
      hourlyActivity: Array(24).fill(0),
      weekdayActivity: Array(7).fill(0),
      voiceMinutes: 0,
      responseTime: 0,
      reactionCount: 0,
      reactionGiven: 0,
      commandUsage: new Map()
    };
  }

  /**
   * 初期サーバー統計オブジェクトの作成
   */
  private createInitialServerStats(serverName: string, serverId: string): ServerConversationStats {
    return {
      serverId,
      serverName,
      totalMessages: 0,
      totalCharacters: 0,
      activeUsers: 0,
      userStats: new Map(),
      channelStats: new Map(),
      hourlyActivity: Array(24).fill(0),
      weekdayActivity: Array(7).fill(0),
      averageMessageLength: 0,
      messageDistribution: new Map()
    };
  }

  /**
   * 初期チャンネル統計オブジェクトの作成
   */
  private createInitialChannelStats(channelId: string, channelName: string): ChannelStats {
    return {
      channelId,
      channelName,
      totalMessages: 0,
      messageByUsers: new Map<string, number>(),
      hourlyActivity: Array(24).fill(0),
      weekdayActivity: Array(7).fill(0)
    };
  }

  /**
   * 単語数のカウント
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * 絵文字数のカウント
   */
  private countEmojis(text: string): number {
    const emojiRegex = /<a?:\w+:\d+>|[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const matches = text.match(emojiRegex);
    return matches ? matches.length : 0;
  }

  /**
   * ユーザー統計の取得
   */
  public getUserStats(serverId: string, userId: string): UserConversationStats | null {
    if (this.userStats.has(serverId) && this.userStats.get(serverId)!.has(userId)) {
      return this.userStats.get(serverId)!.get(userId)!;
    }
    return null;
  }

  /**
   * サーバー統計の取得
   */
  public getServerStats(serverId: string): ServerConversationStats | null {
    return this.serverStats.get(serverId) || null;
  }

  /**
   * 終了処理: 保存して終了
   */
  public shutdown(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.saveStats();
  }
}

function updateChannelStat(channelStat: any, userId: string, message: string) {
  // messageByUsersがMapでない場合、Mapへ変換（freeプランではオブジェクトになっている可能性があるため）
  if (!(channelStat.messageByUsers instanceof Map)) {
    channelStat.messageByUsers = new Map(Object.entries(channelStat.messageByUsers || {}));
  }
  const prevCount = channelStat.messageByUsers.get(userId) ?? 0;
  channelStat.messageByUsers.set(userId, prevCount + 1);
  
}
