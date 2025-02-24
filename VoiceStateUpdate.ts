import { Events, TextChannel, Client } from 'discord.js';
import { VoiceConnectionStatus, joinVoiceChannel } from '@discordjs/voice';
import { speakVoice, play_audio, loadAutoJoinChannels, voiceClients, textChannels, currentSpeaker } from './TTS-Engine'; // Adjust the import path as needed

export function VoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member!;
        const guildId = member.guild.id;
        const voiceClient = voiceClients[guildId];
    
        if (member.user.bot) return;
    
        if (voiceClient && voiceClient.state.status === VoiceConnectionStatus.Ready) {
            if (!oldState.channel && newState.channel) {
                // ユーザーがボイスチャンネルに参加したとき
                if (voiceClient.joinConfig.channelId === newState.channel.id) {
                    const nickname = member.displayName;
                    const path = await speakVoice(`${nickname} さんが入室しました。`, currentSpeaker[guildId] || 888753760, guildId);
                    await play_audio(voiceClient, path, guildId, null);
                }
            } else if (oldState.channel && !newState.channel) {
                // ユーザーがボイスチャンネルから退出したとき
                if (voiceClient.joinConfig.channelId === oldState.channel.id) {
                    const nickname = member.displayName;
                    const path = await speakVoice(`${nickname} さんが退室しました。`, currentSpeaker[guildId] || 888753760, guildId);
                    await play_audio(voiceClient, path, guildId, null);
    
                    // ボイスチャンネルに誰もいなくなったら退室
                    if (oldState.channel.members.filter(member => !member.user.bot).size === 0) {  // ボイスチャンネルにいるのがBOTだけの場合
                        voiceClient.disconnect();
                        delete voiceClients[guildId];
                    }
                }
                    }
        }
    
        // Auto join channels handling
        try {
            const autoJoinChannelsData = loadAutoJoinChannels();
            console.log(`Loaded autoJoinChannels data: ${JSON.stringify(autoJoinChannelsData)}`);
    
            const guildData = autoJoinChannelsData[guildId];
            if (!guildData) return;
    
            const voiceChannelId = guildData.voiceChannelId;
            const textChannelId = guildData.textChannelId;
    
            if (!oldState.channel && newState.channel) {
                if (voiceChannelId === newState.channel.id) {
                    if (!voiceClients[guildId] || voiceClients[guildId].state.status !== VoiceConnectionStatus.Ready) {
                        try {
                            const voiceClient = await joinVoiceChannel({
                                channelId: newState.channel.id,
                                guildId: newState.guild.id,
                                adapterCreator: newState.guild.voiceAdapterCreator as any
                            });
                            voiceClients[guildId] = voiceClient;
                            textChannels[guildId] = client.channels.cache.get(textChannelId) as TextChannel;
                            console.log(`Connected to voice channel ${voiceChannelId} in guild ${guildId}`);
    
                            const path = await speakVoice("自動接続しました。", currentSpeaker[guildId] || 888753760, guildId);
                            if (path) {
                                await play_audio(voiceClient, path, guildId, null);
                            } else {
                                console.error("Error: Path is undefined or null.");
                            }
                        } catch (error) {
                            console.error(`Error: failed to connect to voice channel - ${error}`);
                        }
                    }
                }
            } else if (oldState.channel && !newState.channel) {
                if (voiceChannelId === oldState.channel.id) {
                    if (voiceClients[guildId] && voiceClients[guildId].state.status === VoiceConnectionStatus.Ready) {
                        if (oldState.channel.members.filter(member => !member.user.bot).size === 0) {
                            try {
                                console.log(`${voiceClients[guildId].joinConfig.guildId}: Only BOT is left in the channel, disconnecting.`);
                                voiceClients[guildId].disconnect();
                                delete voiceClients[guildId];
                            } catch (error) {
                                console.error(`Error while disconnecting: ${error}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error in on_voice_state_update: ${error}`);
        }
    });
}