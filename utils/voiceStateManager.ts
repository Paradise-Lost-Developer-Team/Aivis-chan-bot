import * as fs from 'fs';
import * as path from 'path';
import { Client, VoiceChannel, ChannelType, TextChannel } from 'discord.js';
import { monitorMemoryUsage } from './TTS-Engine';
import { instructJoin, getBotInfos, pickLeastBusyBot, pickPrimaryPreferredBot } from './botOrchestrator';

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

// テキストチャンネルのIDを削除する関数
export const removeTextChannelForGuild = (guildId: string): void => {
  if (guildTextChannels[guildId]) {
    delete guildTextChannels[guildId];
    try { saveVoiceState(null); } catch {}
  }
};

// 音声接続状態を保存
export const saveVoiceState = (client: Client | null): void => {
  ensureDataDirExists();
  const voiceState: VoiceStateData = {};
  const existingState = loadVoiceState();
    if (client) {
    client.guilds.cache.forEach(guild => {
      const me = guild.members.cache.get(client.user?.id || '');
      if (me && me.voice.channel) {
        const textChannelId = existingState[guild.id]?.textChannelId || getTextChannelForGuild(guild.id);
        voiceState[guild.id] = {
          channelId: me.voice.channel.id,
          ...(textChannelId ? { textChannelId } : {}) // undefined/nullなら保存しない
        };
      }
    });
  } else {
    Object.keys(existingState).forEach(guildId => {
      const textChannelId = existingState[guildId].textChannelId || getTextChannelForGuild(guildId);
      voiceState[guildId] = {
        channelId: existingState[guildId].channelId,
        ...(textChannelId ? { textChannelId } : {})
      };
    });
    Object.keys(guildTextChannels).forEach(guildId => {
      if (!voiceState[guildId] && existingState[guildId]) {
        const textChannelId = getTextChannelForGuild(guildId);
        voiceState[guildId] = {
          channelId: existingState[guildId].channelId,
          ...(textChannelId ? { textChannelId } : {})
        };
      }
    });
  }
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
      Object.keys(parsedData).forEach(guildId => {
        const textChannelId = parsedData[guildId].textChannelId;
        if (textChannelId) {
          setTextChannelForGuild(guildId, textChannelId);
        } else {
    // 未指定ならヘルパー経由で削除
    removeTextChannelForGuild(guildId);
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
  let instructed = 0;
  let skipped = 0;

  for (const [guildId, state] of Object.entries(voiceState)) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log(`ギルド ${guildId} が見つかりません`);
        skipped++;
        continue;
      }

      const channel = guild.channels.cache.get(state.channelId) as VoiceChannel | undefined;
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.log(`${guildId} のチャンネル ${state.channelId} が見つからないか、ボイスチャンネルではありません`);
        skipped++;
        continue;
      }

      // テキストチャンネル情報の確実な設定
      let finalTextChannelId = state.textChannelId;
      
      if (state.textChannelId) {
        const textChannel = guild.channels.cache.get(state.textChannelId) as TextChannel | undefined;
        if (textChannel && textChannel.type === ChannelType.GuildText) {
          // use helper to persist mapping instead of direct assignment
          setTextChannelForGuild(guildId, state.textChannelId!);
          console.log(`${guild.name}のテキストチャンネル${textChannel.name}を関連付けしました`);
        } else {
          // 保存されたテキストチャンネルが無効な場合はスキップ
          finalTextChannelId = undefined;
        }
      }
      
      // テキストチャンネルが未設定の場合はスキップ（自動選択しない）
      if (!finalTextChannelId) {
        console.warn(`[Reconnect:1st] テキストチャンネルが設定されていないためスキップ: guildId=${guildId} guild=${guild.name}`);
        skipped++;
        continue;
      }

      // オーケストレーション: 当該ギルドに在籍する中で最も空いているBotへ join を指示
      // 1st Botは無料版Bot（2nd-6th）を優先的に使用
      const infos = await getBotInfos();
      const eligible = infos.filter(i => i.ok && i.guildIds?.includes(guildId));
      const picked = pickPrimaryPreferredBot(eligible, ['2nd', '3rd', '4th', '5th', '6th', '1st']);
      if (!picked) {
        console.warn(`在籍Botが見つからずスキップ: guildId=${guildId}`);
        skipped++;
        continue;
      }

      await instructJoin(picked.bot, { guildId, voiceChannelId: channel.id, textChannelId: finalTextChannelId });
      console.log(`再接続指示: bot=${picked.bot.name} guild=${guild.name} vc=${channel.name}`);
      instructed++;

      // 同時接続のスパイク回避
      await wait(250);
    } catch (error) {
      console.error(`${guildId}のボイスチャンネル再接続指示エラー:`, error);
      skipped++;
    }
  }

  console.log(`ボイスチャンネル再接続（指示）完了: 指示=${instructed}, スキップ=${skipped}`);

  // メモリ使用状況をチェック（任意）
  try { monitorMemoryUsage(); } catch {}
};
