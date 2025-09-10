// Sub bot: voice_state.json 廃止。API互換のダミー実装を提供します。
import { Client } from 'discord.js';

type VoiceStateData = { [guildId: string]: { channelId: string; textChannelId?: string } };
export const setTextChannelForGuild = (_guildId: string, _textChannelId: string): void => { /* no-op */ };
export const getTextChannelForGuild = (_guildId: string): string | undefined => undefined;
export const saveVoiceState = (_client: Client | null): void => { /* no-op */ };
export const loadVoiceState = (): VoiceStateData => ({ });
export const reconnectToVoiceChannels = async (_client: Client): Promise<void> => { /* no-op */ };
