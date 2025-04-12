import { isProFeatureAvailable, isPremiumFeatureAvailable } from './subscription';
import fs from 'fs';
import path from 'path';
import { speakVoice, play_audio, voiceClients, currentSpeaker } from './TTS-Engine';
import { Message } from 'discord.js';
import { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayer } from '@discordjs/voice';

interface Reminder {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  message: string;
  time: Date;
  voiceEnabled: boolean;
  voiceMessage?: string;
}

export class VoiceReminder {
  private reminders: Map<string, Reminder> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private dataPath: string;
  private audioPlayers: Map<string, AudioPlayer> = new Map();
  
  constructor() {
    this.dataPath = path.join(__dirname, '../data/reminders.json');
    this.loadReminders();
    this.scheduleAllReminders();
  }

  // リマインダーを設定
  public async setReminder(
    message: Message,
    reminderText: string,
    time: Date,
    voiceEnabled: boolean = false
  ): Promise<string> {
    const userId = message.author.id;
    const guildId = message.guild?.id;
    const channelId = message.channel.id;
    
    // 音声機能の権限チェック
    if (voiceEnabled) {
      const isPremium = isPremiumFeatureAvailable(userId, 'voice-reminder');
      const isPro = isProFeatureAvailable(userId, 'voice-reminder');
      
      if (!isPremium && !isPro) {
        return '音声付きリマインダーはPremiumまたはProプランでのみ利用可能です。';
      }
      
      // Proユーザーは制限付き（例: 100文字まで）
      if (isPro && !isPremium && reminderText.length > 100) {
        return 'Proプランでは100文字までの音声リマインダーが設定可能です。Premiumプランにアップグレードすると制限なく利用できます。';
      }
      
      // ボイスチャンネルにユーザーがいるかチェック
      if (!message.member?.voice.channel) {
        return 'ボイスチャンネルに参加した状態で音声リマインダーを設定してください。';
      }
    }

    const reminderId = this.generateReminderId();
    const reminder: Reminder = {
      id: reminderId,
      userId,
      guildId: guildId || '',
      channelId,
      message: reminderText,
      time,
      voiceEnabled,
      voiceMessage: voiceEnabled ? reminderText : undefined
    };
    
    this.reminders.set(reminderId, reminder);
    this.scheduleReminder(reminderId);
    this.saveReminders();
    
    return voiceEnabled
      ? `🔊 音声付きリマインダーを${this.formatTime(time)}に設定しました。`
      : `⏰ リマインダーを${this.formatTime(time)}に設定しました。`;
  }

  // リマインダーをキャンセル
  public cancelReminder(userId: string, reminderId: string): string {
    const reminder = this.reminders.get(reminderId);
    
    if (!reminder) {
      return 'リマインダーが見つかりませんでした。';
    }
    
    if (reminder.userId !== userId) {
      return '他のユーザーのリマインダーはキャンセルできません。';
    }
    
    const timer = this.timers.get(reminderId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(reminderId);
    }
    
    this.reminders.delete(reminderId);
    this.saveReminders();
    
    return 'リマインダーをキャンセルしました。';
  }

  // ユーザーのリマインダー一覧を取得
  public getUserReminders(userId: string): Reminder[] {
    return Array.from(this.reminders.values())
      .filter(reminder => reminder.userId === userId)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  private generateReminderId(): string {
    return `reminder-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private scheduleAllReminders(): void {
    for (const reminderId of this.reminders.keys()) {
      this.scheduleReminder(reminderId);
    }
  }

  private scheduleReminder(reminderId: string): void {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return;

    const now = new Date();
    let delay = reminder.time.getTime() - now.getTime();
    
    // 過去の時間の場合は削除
    if (delay < 0) {
      this.reminders.delete(reminderId);
      this.saveReminders();
      return;
    }
    
    // 最大タイマー値を超える場合は調整
    const maxTimeout = 2147483647; // ~24.8日
    if (delay > maxTimeout) {
      delay = maxTimeout;
      // 後で再スケジュールする
    }
    
    const timer = setTimeout(() => this.triggerReminder(reminderId), delay);
    this.timers.set(reminderId, timer);
  }

  private async triggerReminder(reminderId: string): Promise<void> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return;

    try {
      // テキスト通知
      // Discordクライアントを使って通知を送る実装
      // client.channels.cache.get(reminder.channelId)?.send(`<@${reminder.userId}> リマインダー: ${reminder.message}`);
      
      // 音声通知（プレミアム機能）
      if (reminder.voiceEnabled && reminder.voiceMessage) {
        await this.playVoiceMessage(reminder);
      }
    } catch (error) {
      console.error('リマインダー通知に失敗しました:', error);
    }

    // リマインダーを削除
    this.reminders.delete(reminderId);
    this.timers.delete(reminderId);
    this.saveReminders();
  }

  private async playVoiceMessage(reminder: Reminder): Promise<void> {
    try {
      const guild = reminder.guildId;
      const member = reminder.userId;
      
      // ボイスクライアントが存在するか確認
      if (guild in voiceClients) {
        // 既存のボイスクライアントを使用して音声を再生
        await speakVoice(reminder.voiceMessage || '', currentSpeaker[guild] || 888753760, guild);
      } else {
        // ユーザーがボイスチャンネルに接続していない場合は音声再生できない
        console.log('ボイスチャンネルに接続されていないため、音声リマインダーを再生できません');
      }
    } catch (error) {
      console.error('音声メッセージの再生に失敗しました:', error);
    }
  }

  private formatTime(date: Date): string {
    return date.toLocaleString('ja-JP', {
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private loadReminders(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        data.forEach((rem: Reminder) => {
          rem.time = new Date(rem.time);
          this.reminders.set(rem.id, rem);
        });
      }
    } catch (error) {
      console.error('リマインダー情報の読み込みに失敗しました:', error);
    }
  }

  private saveReminders(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = Array.from(this.reminders.values());
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('リマインダー情報の保存に失敗しました:', error);
    }
  }
}
