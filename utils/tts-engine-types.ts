// Shared TypeScript types for TTS engine modules
export type VoiceSettingsShape = {
  volume?: Record<string, number>;
  pitch?: Record<string, number>;
  speed?: Record<string, number>;
  intonation?: Record<string, number>;
  tempo?: Record<string, number>;
  speaker?: Record<string, any>;
  [k: string]: any;
};

export interface TTSEngineExports {
  voiceSettings: VoiceSettingsShape;
  saveUserVoiceSettings?: () => void;
  loadUserVoiceSettings?: () => void;
  setTextChannelForGuildInMap?: (guildId: string, channel: any | null | undefined, persist?: boolean) => void;
  addTextChannelsForGuildInMap?: (guildId: string, channels?: any[]) => void;
  removeTextChannelForGuildInMap?: (guildId: string) => void;
  textChannels?: Record<string, any>;
  voiceClients?: Record<string, any>;
  autoJoinChannels?: Record<string, any>;
  [k: string]: any;
}
