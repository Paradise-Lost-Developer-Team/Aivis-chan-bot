import * as fs from 'fs';
import * as path from 'path';
import { Client, Guild, VoiceChannel, ChannelType, TextChannel } from 'discord.js';
import { joinVoiceChannel, VoiceConnection, getVoiceConnection } from '@discordjs/voice';
import { speakVoice, voiceClients, play_audio, currentSpeaker } from './TTS-Engine'; // play_audioもインポート

// プロジェクトルートディレクトリへのパスを取得する関数
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

// dataディレクトリを確実にプロジェクトルート下に作成
const PROJECT_ROOT = getProjectRoot();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const VOICE_STATE_PATH = path.join(DATA_DIR, 'voice_state.json');

// テキストチャンネルIDも保存できるように拡張
interface VoiceStateData {
  [guildId: string]: {
    channelId: string;
    textChannelId?: string; // テキストチャンネルID（省略可）
  };
}

// データフォルダが存在しない場合は作成
const ensureDataDirExists = (): void => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`データディレクトリを作成しました: ${DATA_DIR}`);
  }
};

// グローバル変数で関連テキストチャンネルのマッピングを保持
const guildTextChannels: { [guildId: string]: string } = {};

// テキストチャンネルのIDを保存する関数
export const setTextChannelForGuild = (guildId: string, textChannelId: string): void => {
  guildTextChannels[guildId] = textChannelId;
  saveVoiceState(null); // clientを渡さない場合は現在の状態からのみ保存
};

// テキストチャンネルのIDを取得する関数
export const getTextChannelForGuild = (guildId: string): string | undefined => {
  return guildTextChannels[guildId];
};

// 音声接続状態を保存
export const saveVoiceState = (client: Client | null): void => {
  ensureDataDirExists();
  
  const voiceState: VoiceStateData = {};
  
  // 既存の保存データがあれば読み込む（テキストチャンネル情報を引き継ぐため）
  const existingState = loadVoiceState();
  
  // クライアントが提供されている場合は、現在の接続状態を追跡
  if (client) {
    client.guilds.cache.forEach(guild => {
      // ボットがボイスチャンネルに接続しているか確認
      const me = guild.members.cache.get(client.user?.id || '');
      if (me && me.voice.channel) {
        voiceState[guild.id] = {
          channelId: me.voice.channel.id,
          // 保存されているテキストチャンネルIDをセット、なければグローバル変数から取得
          textChannelId: existingState[guild.id]?.textChannelId || guildTextChannels[guild.id]
        };
      }
    });
  } else {
    // クライアントが提供されていない場合は、グローバル変数とexistingStateを使用
    Object.keys(existingState).forEach(guildId => {
      voiceState[guildId] = {
        channelId: existingState[guildId].channelId,
        textChannelId: existingState[guildId].textChannelId || guildTextChannels[guildId]
      };
    });
    
    // グローバル変数にあるがexistingStateにないものを追加
    Object.keys(guildTextChannels).forEach(guildId => {
      if (!voiceState[guildId] && existingState[guildId]) {
        voiceState[guildId] = {
          channelId: existingState[guildId].channelId,
          textChannelId: guildTextChannels[guildId]
        };
      }
    });
  }
  
  // JSONとして保存
  try {
    fs.writeFileSync(VOICE_STATE_PATH, JSON.stringify(voiceState, null, 2));
    console.log(`ボイス接続状態を保存しました: ${VOICE_STATE_PATH}`);
  } catch (error) {
    console.error(`ボイス接続状態の保存に失敗しました: ${error}`);
  }
};

// 音声接続状態を読み込み
export const loadVoiceState = (): VoiceStateData => {
  ensureDataDirExists();
  
  try {
    if (fs.existsSync(VOICE_STATE_PATH)) {
      const data = fs.readFileSync(VOICE_STATE_PATH, 'utf8');
      const parsedData = JSON.parse(data) as VoiceStateData;
      
      // グローバル変数にテキストチャンネル情報を読み込む
      Object.keys(parsedData).forEach(guildId => {
        if (parsedData[guildId].textChannelId) {
          guildTextChannels[guildId] = parsedData[guildId].textChannelId!;
        }
      });
      
      return parsedData;
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
      
      // テキストチャンネル情報があれば、グローバル変数に格納
      if (state.textChannelId) {
        const textChannel = guild.channels.cache.get(state.textChannelId) as TextChannel | undefined;
        if (textChannel && textChannel.type === ChannelType.GuildText) {
          guildTextChannels[guildId] = state.textChannelId;
          console.log(`${guild.name}のテキストチャンネル${textChannel.name}を関連付けしました`);
        } else {
          console.log(`${guildId} のテキストチャンネル ${state.textChannelId} が見つからないか、テキストチャンネルではありません`);
        }
      }
      
      console.log(`${guild.name}のチャンネル${channel.name}に再接続します...`);
      
      // 既に接続されていれば切断
      const existingConnection = getVoiceConnection(guild.id);
      if (existingConnection) {
        existingConnection.destroy();
        await wait(1000); // 切断処理を待機
        
        // voiceClientsからも削除
        if (voiceClients[guildId]) {
          delete voiceClients[guildId];
        }
      }
      
      // ボイスチャンネルに接続
      try {
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: true,     // スピーカーはOFF（聞こえない）
          selfMute: false     // マイクはON（話せる）
        });
        
        // 接続が確立されるまで待機
        await new Promise<void>((resolve, reject) => {
          // 成功したとき
          const onReady = async () => {
            connection.removeListener('error', onError);
            console.log(`${guild.name}のチャンネル${channel.name}に再接続しました`);
            
            // 重要: voiceClientsオブジェクトに接続を登録
            voiceClients[guildId] = connection;
            console.log(`ギルド ${guildId} の接続をvoiceClientsに登録しました`);

            // 安定するまで少し待機
            await wait(1000);

            // 再接続アナウンスを流す
            try {
              console.log(`${guild.name}のチャンネルに再接続アナウンスを送信します...`);
              const speakerId = currentSpeaker[guildId] || 888753760;
              const audioPath = await speakVoice('再起動後の再接続が完了しました', speakerId, guildId);
              if (audioPath) {
                // 音声ファイル生成成功
                console.log(`再接続アナウンス音声ファイル生成成功: ${audioPath}`);
                await play_audio(connection, audioPath, guildId, null);
                console.log(`${guild.name}のチャンネルに再接続アナウンスを送信しました`);
              } else {
                console.error(`再接続アナウンス音声ファイル生成失敗`);
              }
            } catch (audioError) {
              console.error(`再接続アナウンス送信エラー: ${audioError}`);
            }
            
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
            selfDeaf: true,   // スピーカーはOFF（聞こえない）
            selfMute: false   // マイクはON（話せる）
          });
          
          // リトライの接続が確立されるまで待機
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('リトライ接続タイムアウト'));
            }, 10000);
            
            retryConnection.once('ready', async () => {
              clearTimeout(timeout);
              console.log(`${guild.name}のチャンネル${channel.name}に再接続しました（リトライ後）`);
              
              // 重要: リトライ後もvoiceClientsオブジェクトに接続を登録
              voiceClients[guildId] = retryConnection;
              console.log(`ギルド ${guildId} の接続をvoiceClientsに登録しました（リトライ後）`);
              
              // 安定するまで少し待機
              await wait(1000);
              
              // リトライ後も再接続アナウンスを流す
              try {
                console.log(`${guild.name}のチャンネルにリトライ後の再接続アナウンスを送信します...`);
                const speakerId = currentSpeaker[guildId] || 888753760;
                const audioPath = await speakVoice('再起動後の再接続が完了しました', speakerId, guildId);
                if (audioPath) {
                  // 音声ファイル生成成功
                  console.log(`リトライ後の再接続アナウンス音声ファイル生成成功: ${audioPath}`);
                  await play_audio(retryConnection, audioPath, guildId, null);
                  console.log(`${guild.name}のチャンネルにリトライ後の再接続アナウンスを送信しました`);
                } else {
                  console.error(`リトライ後の再接続アナウンス音声ファイル生成失敗`);
                }
              } catch (audioError) {
                console.error(`リトライ後の再接続アナウンス送信エラー: ${audioError}`);
              }
              
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
