// Minimal VoiceStateUpdate handler for 6th bot
// Purpose: remove merge conflict markers and provide a small, safe handler.
// Replace with fully-featured implementation after repository cleanup.

import { Events, Client, VoiceState } from 'discord.js';
import { speakAnnounce } from './TTS-Engine';

export function VoiceStateUpdate(client: Client) {
    client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
        try {
            // ignore bot users
            if (newState.member?.user.bot) return;

            // simple announce when a user joins a voice channel where the bot is present
            if (!oldState.channel && newState.channel) {
                try {
                    await speakAnnounce(`${newState.member?.displayName ?? 'ユーザー'} さんが入室しました`, newState.guild?.id ?? newState.channel?.id, client);
                } catch (e) {
                    // swallow errors here to avoid crashing voice state handler
                    console.error('speakAnnounce error:', e);
                }
            }
        } catch (err) {
            console.error('VoiceStateUpdate handler error:', err);
        }
    });
}