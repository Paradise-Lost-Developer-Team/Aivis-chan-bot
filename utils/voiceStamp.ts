import { Client, VoiceChannel, GuildMember } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus, VoiceConnection, getVoiceConnection } from '@discordjs/voice';
import { logError } from './errorLogger';
import { captureException } from './sentry';
import { AivisAdapter } from './TTS-Engine';

// ボイススタンプのデータ構造
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

// ボイススタンプのカテゴリ
type StampCategory = 'reaction' | 'sound_effect' | 'music' | 'character' | 'custom';

// ボイススタンプ作成オプション
interface VoiceStampCreateOptions {
  name: string;
  userId: string;
  guildId: string;
  audioBuffer: Buffer;
  isGlobal?: boolean;
  category?: StampCategory;
}

// データ保存場所の設定
const STAMP_DIRECTORY = path.join(__dirname, '../data/voice_stamps');
const STAMP_DATA_FILE = path.join(__dirname, '../data/voice_stamps.json');

// ディレクトリがなければ作成
if (!fs.existsSync(STAMP_DIRECTORY)) {
  fs.mkdirSync(STAMP_DIRECTORY, { recursive: true });
}

/**
 * ボイススタンプ管理クラス
 * ボイススタンプの保存、取得、再生などを管理する
 */
export class VoiceStampManager {
  private static instance: VoiceStampManager;
  private stamps: Map<string, VoiceStamp> = new Map();
  private activeConnections: Map<string, VoiceConnection> = new Map();
  private client: Client;

  private constructor(client: Client) {
    this.client = client;
    this.loadStamps();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(client: Client): VoiceStampManager {
    if (!VoiceStampManager.instance) {
      VoiceStampManager.instance = new VoiceStampManager(client);
    }
    return VoiceStampManager.instance;
  }

  /**
   * 保存されているボイススタンプを読み込む
   */
  private loadStamps(): void {
    try {
      if (fs.existsSync(STAMP_DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(STAMP_DATA_FILE, 'utf-8'));
        for (const stamp of data) {
          this.stamps.set(stamp.id, {
            ...stamp,
            createdAt: new Date(stamp.createdAt)
          });
        }
        console.log(`${this.stamps.size} ボイススタンプを読み込みました`);
      }
    } catch (error) {
      console.error('ボイススタンプの読み込みに失敗しました:', error);
      captureException(error, 'voiceStampLoad');
    }
  }

  /**
   * ボイススタンプデータを保存
   */
  private saveStamps(): void {
    try {
      const data = Array.from(this.stamps.values());
      fs.writeFileSync(STAMP_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('ボイススタンプの保存に失敗しました:', error);
      captureException(error, 'voiceStampSave');
    }
  }

  /**
   * 新しいボイススタンプを作成
   */
  public async createStamp(options: VoiceStampCreateOptions): Promise<VoiceStamp | null> {
    try {
      const id = `stamp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const filePath = path.join(STAMP_DIRECTORY, `${id}.mp3`);
      
      // ファイルに保存
      fs.writeFileSync(filePath, options.audioBuffer);
      
      // メタデータの取得（実際の実装ではオーディオファイルのメタデータから取得する）
      const duration = 5; // 仮の値、実際には計算する必要がある
      
      const stamp: VoiceStamp = {
        id,
        name: options.name,
        userId: options.userId,
        guildId: options.guildId,
        filePath,
        createdAt: new Date(),
        useCount: 0,
        isGlobal: options.isGlobal || false,
        duration,
        category: options.category
      };
      
      this.stamps.set(id, stamp);
      this.saveStamps();
      
      return stamp;
    } catch (error) {
      console.error('ボイススタンプの作成に失敗しました:', error);
      captureException(error, 'voiceStampCreate');
      return null;
    }
  }

  /**
   * ボイススタンプを再生
   */
  public async playStamp(stampId: string, voiceChannel: VoiceChannel, member: GuildMember): Promise<boolean> {
    const stamp = this.stamps.get(stampId);
    if (!stamp || !fs.existsSync(stamp.filePath)) {
      return false;
    }

    try {
      // まずVoiceConnectionを取得する
      let connection = getVoiceConnection(voiceChannel.guild.id);
      
      // 接続がない場合は自分のコネクションをチェック
      if (!connection) {
        connection = this.activeConnections.get(voiceChannel.guild.id);
      }
      
      // それでも接続がない場合は新規接続
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        this.activeConnections.set(voiceChannel.guild.id, connection);
      }

      // オーディオリソースとプレイヤーの作成
      const resource = createAudioResource(stamp.filePath);
      const player = createAudioPlayer();
      
      // ボイススタンプの使用回数を増加
      stamp.useCount++;
      this.saveStamps();
      
      // プレイヤーをボイスコネクションに接続して再生
      connection.subscribe(player);
      player.play(resource);
      
      // 完了時のイベント設定
      return new Promise((resolve) => {
        player.on(AudioPlayerStatus.Idle, () => {
          resolve(true);
        });
        
        player.on('error', (error) => {
          console.error('ボイススタンプ再生エラー:', error);
          captureException(error, 'voiceStampPlayback');
          resolve(false);
        });
      });
    } catch (error) {
      console.error('ボイススタンプの再生に失敗しました:', error);
      captureException(error, 'voiceStampPlay');
      return false;
    }
  }

  /**
   * ボイススタンプを削除
   */
  public deleteStamp(stampId: string, userId: string): boolean {
    const stamp = this.stamps.get(stampId);
    if (!stamp || (stamp.userId !== userId && !stamp.isGlobal)) {
      return false;
    }

    try {
      // ファイルが存在する場合は削除
      if (fs.existsSync(stamp.filePath)) {
        fs.unlinkSync(stamp.filePath);
      }
      
      // マップからも削除
      this.stamps.delete(stampId);
      this.saveStamps();
      return true;
    } catch (error) {
      console.error('ボイススタンプの削除に失敗しました:', error);
      captureException(error, 'voiceStampDelete');
      return false;
    }
  }

  /**
   * ボイススタンプの一覧を取得
   */
  public getStamps(guildId: string, includeGlobal = true): VoiceStamp[] {
    const result: VoiceStamp[] = [];
    
    for (const stamp of this.stamps.values()) {
      if (stamp.guildId === guildId || (includeGlobal && stamp.isGlobal)) {
        result.push(stamp);
      }
    }
    
    return result;
  }

  /**
   * 特定のユーザーが所有するボイススタンプの一覧を取得
   */
  public getUserStamps(userId: string): VoiceStamp[] {
    const result: VoiceStamp[] = [];
    
    for (const stamp of this.stamps.values()) {
      if (stamp.userId === userId) {
        result.push(stamp);
      }
    }
    
    return result;
  }

  /**
   * ボイススタンプ情報の更新
   */
  public updateStamp(stampId: string, userId: string, updates: Partial<VoiceStamp>): boolean {
    const stamp = this.stamps.get(stampId);
    if (!stamp || (stamp.userId !== userId && !stamp.isGlobal)) {
      return false;
    }

    try {
      // 更新可能なフィールドのみを更新
      if (updates.name) stamp.name = updates.name;
      if (updates.category) stamp.category = updates.category;
      if (typeof updates.isGlobal === 'boolean') stamp.isGlobal = updates.isGlobal;
      
      this.stamps.set(stampId, stamp);
      this.saveStamps();
      return true;
    } catch (error) {
      console.error('ボイススタンプの更新に失敗しました:', error);
      captureException(error, 'voiceStampUpdate');
      return false;
    }
  }
}

// ボイススタンプ関連イベントを設定する関数
export function setupVoiceStampEvents(client: Client): void {
  const stampManager = VoiceStampManager.getInstance(client);
  
  // メッセージイベントなどでボイススタンプ再生機能を追加できる
  // 例: !stamp <名前> のようなコマンドでボイススタンプを再生
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // ここでボイススタンプのコマンドを処理
    // 実際の実装ではスラッシュコマンドを使用することが推奨
  });
}
