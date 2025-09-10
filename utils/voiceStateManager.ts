// Sub bot: voice_state.json 廃止。API互換のダミー実装を提供します。
import { Client } from 'discord.js';
import { monitorMemoryUsage } from './TTS-Engine';

// API互換の型
type VoiceStateData = { [guildId: string]: { channelId: string; textChannelId?: string } };

export const setTextChannelForGuild = (_guildId: string, _textChannelId: string): void => { /* no-op */ };
export const getTextChannelForGuild = (_guildId: string): string | undefined => undefined;
export const saveVoiceState = (_client: Client | null): void => { /* no-op: sub bot は保存しない */ };
export const loadVoiceState = (): VoiceStateData => ({ /* no-op: sub bot は読み込まない */ });
export const reconnectToVoiceChannels = async (_client: Client): Promise<void> => { /* no-op: sub bot は再接続しない（1stが指示） */ };
