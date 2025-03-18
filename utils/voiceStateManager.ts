import * as fs from 'fs';
import * as path from 'path';
import { Client, Guild, VoiceChannel, ChannelType } from 'discord.js';
import { joinVoiceChannel, VoiceConnection, getVoiceConnection } from '@discordjs/voice';

const VOICE_STATE_PATH = path.join(__dirname, '..', 'data', 'voice_state.json');

interface VoiceStateData {
  [guildId: string]: {
    channelId: string;
  };
}

// データフォルダが存在しない場合は作成
const ensureDataDirExists = (): void => {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// 音声接続状態を保存
export const saveVoiceState = (client: Client): void => {
  ensureDataDirExists();
  
  const voiceState: VoiceStateData = {};
  
  // クライアントの各ボイス接続を確認
  client.guilds.cache.forEach(guild => {
    // Check if the bot is connected to a voice channel in this guild
    const me = guild.members.cache.get(client.user?.id || '');
    if (me && me.voice.channel) {
      voiceState[guild.id] = {
        channelId: me.voice.channel.id
      };
    }
  });
  
  // JSONとして保存
  fs.writeFileSync(VOICE_STATE_PATH, JSON.stringify(voiceState, null, 2));
  console.log('ボイス接続状態を保存しました');
};

// 音声接続状態を読み込み
export const loadVoiceState = (): VoiceStateData => {
  ensureDataDirExists();
  
  try {
    if (fs.existsSync(VOICE_STATE_PATH)) {
      const data = fs.readFileSync(VOICE_STATE_PATH, 'utf8');
      return JSON.parse(data) as VoiceStateData;
    }
  } catch (error) {
    console.error('ボイス状態の読み込みエラー:', error);
  }
  
  return {};
};

// 指定したミリ秒だけ待機するPromiseを返す関数
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// 保存した状態に基づいてボイスチャンネルに再接続
export const reconnectToVoiceChannels = async (client: Client): Promise<void> => {
  const voiceState = loadVoiceState();
  let successCount = 0;
  let failCount = 0;
  
  for (const [guildId, state] of Object.entries(voiceState)) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log(`ギルド ${guildId} が見つかりません`);
        continue;
      }
      
      const channel = guild.channels.cache.get(state.channelId) as VoiceChannel | undefined;
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.log(`${guildId} のチャンネル ${state.channelId} が見つからないか、ボイスチャンネルではありません`);
        continue;
      }
      
      console.log(`${guild.name}のチャンネル${channel.name}に再接続します...`);
      
      // 既に接続されていれば切断
      const existingConnection = getVoiceConnection(guild.id);
      if (existingConnection) {
        existingConnection.destroy();
        await wait(1000); // 切断処理を待機
      }
      
      // ボイスチャンネルに接続
      try {
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false
        });
        
        // 接続が確立されるまで待機
        await new Promise<void>((resolve, reject) => {
          // 成功したとき
          const onReady = () => {
            connection.removeListener('error', onError);
            console.log(`${guild.name}のチャンネル${channel.name}に再接続しました`);
            resolve();
          };
          
          // エラー発生時
          const onError = (error: Error) => {
            connection.removeListener('ready', onReady);
            reject(error);
          };
          
          // イベントリスナーを設定
          connection.once('ready', onReady);
          connection.once('error', onError);
          
          // すでに接続済みの場合
          if (connection.state.status === 'ready') {
            connection.removeListener('error', onError);
            resolve();
          }
          
          // タイムアウト処理（10秒後）
          setTimeout(() => {
            connection.removeListener('ready', onReady);
            connection.removeListener('error', onError);
            if (connection.state.status !== 'ready') {
              reject(new Error('接続タイムアウト'));
            } else {
              resolve();
            }
          }, 10000);
        });
        
        successCount++;
        // 接続完了後、少し待機して状態が安定するのを確認
        await wait(2000);
        
      } catch (joinError) {
        console.error(`ボイスチャンネル接続エラー: ${joinError}`);
        
        // リトライ処理
        try {
          await wait(3000); // リトライ前に少し待機
          
          const retryConnection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
          });
          
          // リトライの接続が確立されるまで待機
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('リトライ接続タイムアウト'));
            }, 10000);
            
            retryConnection.once('ready', () => {
              clearTimeout(timeout);
              console.log(`${guild.name}のチャンネル${channel.name}に再接続しました（リトライ後）`);
              resolve();
            });
            
            retryConnection.once('error', (error) => {
              clearTimeout(timeout);
              reject(error);
            });
          });
          
          successCount++;
          await wait(2000); // 接続後少し待機
          
        } catch (retryError) {
          console.error(`ボイスチャンネル接続リトライエラー: ${retryError}`);
          failCount++;
        }
      }
    } catch (error) {
      console.error(`${guildId}のボイスチャンネル再接続エラー:`, error);
      failCount++;
    }
  }
  
  console.log(`ボイスチャンネル再接続完了: ${successCount}成功, ${failCount}失敗`);
  
  // すべての接続が完了したら、再度すべての接続状態を保存
  if (successCount > 0) {
    await wait(3000); // 安定するまで待機
    saveVoiceState(client);
  }
};
