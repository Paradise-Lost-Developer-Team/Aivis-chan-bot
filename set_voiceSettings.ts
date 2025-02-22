import * as fs from 'fs';

export const voiceSettings: { [key: string]: any } = { volume: {}, pitch: {}, speed: {}, style_strength: {}, tempo: {} };
export const SPEAKERS_FILE = "speakers.json";
export let speakers: any[] = [];

export function adjustAudioQuery(audioQuery: any, guildId: string) {
    audioQuery.volumeScale = voiceSettings.volume[guildId] || 0.5;
    audioQuery.pitchScale = voiceSettings.pitch[guildId] || 0.0;
    audioQuery.rateScale = voiceSettings.rate[guildId] || 1.0;
    audioQuery.speedScale = voiceSettings.speed[guildId] || 1.0;
    audioQuery.styleStrength = voiceSettings.style_strength[guildId] || 1.0;
    audioQuery.tempoScale = voiceSettings.tempo[guildId] || 1.0;
    return audioQuery;
}

export function loadSpeakers() {
    try {
        speakers = JSON.parse(fs.readFileSync(SPEAKERS_FILE, "utf-8"));
    } catch (error) {
        console.error("Error loading speakers:", error);
        speakers = [];
    }
}

loadSpeakers();

export function getSpeakerOptions() {
    return speakers.flatMap(speaker => 
        speaker.styles.map((style: { name: string; id: { toString: () => string; }; }) => ({
            label: `${speaker.name} - ${style.name}`,
            value: `${speaker.name}-${style.name}-${style.id.toString()}`
        }))
    );
}