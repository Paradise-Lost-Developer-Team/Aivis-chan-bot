import * as fs from 'fs';
import * as path from 'path';
import { Client, Guild, VoiceChannel, ChannelType } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';

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

// 保存した状態に基づいてボイスチャンネルに再接続
export const reconnectToVoiceChannels = async (client: Client): Promise<void> => {
  const voiceState = loadVoiceState();
  
  for (const [guildId, state] of Object.entries(voiceState)) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      
      const channel = guild.channels.cache.get(state.channelId) as VoiceChannel | undefined;
      if (!channel || channel.type !== ChannelType.GuildVoice) continue;
      
      // すでに接続されていないか確認
      const guildMember = guild.members.me;
        console.log(`${guild.name}のチャンネル${channel.name}に再接続します...`);
        
        // ボイスチャンネルに接続
        joinVoiceChannel({
          channelId: channel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
        });
        console.log(`${guild.name}のチャンネル${channel.name}に再接続しました`);
        console.log(`${guild.name}のチャンネル${channel.name}に再接続しました`);
      
    } catch (error) {
      console.error(`${guildId}のボイスチャンネル再接続エラー:`, error);
    }
  }
};
