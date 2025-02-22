import { AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import path from "path";
import os from "os";
import { TextChannel } from "discord.js";
import { pipeline } from 'stream/promises';

// 追加: 合成結果キャッシュの定義（TTLは10分）
const synthesisCache = new Map<string, { path: string, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;  // 10分

export const voiceSettings = {
    volume: {} as { [guildId: string]: number },
    pitch: {} as { [guildId: string]: number },
    rate: {} as { [guildId: string]: number },
    speed: {} as { [guildId: string]: number },
    style_strength: {} as { [guildId: string]: number },
    tempo: {} as { [guildId: string]: number },
};

// 必要に応じて currentSpeaker も初期化
export const currentSpeaker: { [guildId: string]: number } = {};
export const SPEAKERS_FILE = "speakers.json";
export let speakers: any[] = [];

export function getPlayer(guildId: string): AudioPlayer {
    if (!players[guildId]) {
        players[guildId] = new AudioPlayer();
    }
    return players[guildId];
}

export const textChannels: { [key: string]: TextChannel } = {};
export const voiceClients: { [key: string]: VoiceConnection } = {};
export const autoJoinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
export const players: { [key: string]: AudioPlayer } = {};

export class AivisAdapter {
        URL: string;
        speaker: number;

        constructor() {
            this.URL = "http://127.0.0.1:10101";
            this.speaker = 0; // 話者IDを設定
        }
    }

export const aivisAdapter = new AivisAdapter();


export async function createFFmpegAudioSource(path: string) {
    return createAudioResource(path, { inputType: StreamType.Arbitrary });
}

export async function postAudioQuery(text: string, speaker: number) {
    const params = new URLSearchParams({ text, speaker: speaker.toString() }).toString();
    try {
        const response = await fetch(`http://127.0.0.1:10101/audio_query?${params}`, {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error(`Error in postAudioQuery: ${response.statusText}`);
        }
        const audioQuery = await response.json();
        console.log('Received audioQuery:', audioQuery); // デバッグ用ログ
        return audioQuery;
    } catch (error) {
        console.error("Error in postAudioQuery:", error);
        throw error;
    }
}

export async function postSynthesis(audioQuery: any, speaker: number) {
    try {
        const params = new URLSearchParams({ speaker: speaker.toString(), enable_interrogative_upspeak: "true" });
        const requestBody = JSON.stringify(audioQuery);
        console.log('Sending request to synthesis API with params:', params.toString());
        console.log('Request body:', requestBody);
        const response = await fetch(`http://127.0.0.1:10101/synthesis?${params}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error in postSynthesis: ${response.statusText} - ${errorText}`);
        }
        
        const audioStream = response.body;
        if (!audioStream) {
            throw new Error("Audio stream is null");
        }
        // Return the response body as a Readable stream for streaming processing
        return response.body;
    } catch (error) {
        console.error("Error in postSynthesis:", error);
        throw error;
    }
}

export function adjustAudioQuery(audioQuery: any, guildId: string) {
    const speakerId = currentSpeaker[guildId] || 888753760;
    audioQuery.speaker = speakerId;
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

// スピーカーリストを取得して choices に変換
export function getSpeakerChoices() {
    return speakers.map(speaker =>
        speaker.styles.map((style: { name: any; id: { toString: () => any; }; }) => ({
            name: `${speaker.name} - ${style.name}`, // 例: "Anneli - ノーマル"
            value: style.id.toString(), // 数値ではなく文字列に変換
        }))
    ).flat();
}

export const DICTIONARY_FILE = "guild_dictionaries.json";
let guildDictionary: { [key: string]: any } = {};

try {
    guildDictionary = JSON.parse(fs.readFileSync(DICTIONARY_FILE, "utf-8"));
} catch (error) {
    guildDictionary = {};
}

export const MAX_TEXT_LENGTH = 200;

export async function speakVoice(text: string, speaker: number, guildId: string) {
    if (text.length > MAX_TEXT_LENGTH) {
        text = text.substring(0, MAX_TEXT_LENGTH) + "...";
    }
    
    // 追加: キャッシュキーを生成し、キャッシュチェックを行う
    const cacheKey = `${speaker}:${text}`;
    if (synthesisCache.has(cacheKey)) {
        const cached = synthesisCache.get(cacheKey)!;
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log("Using cached synthesized audio");
            return cached.path;
        } else {
            synthesisCache.delete(cacheKey);
        }
    }
    setInterval(() => {
        const now = Date.now();
        for (const [key, { timestamp }] of synthesisCache.entries()) {
            if (now - timestamp > CACHE_TTL) {
                synthesisCache.delete(key);
            }
        }
    }, 60 * 1000); // 1分ごとにキャッシュをチェック
    
    let audioQuery = await postAudioQuery(text, speaker);
    audioQuery = adjustAudioQuery(audioQuery, guildId);
    const audioStream = await postSynthesis(audioQuery, speaker);
    const tempAudioFilePath = path.join(os.tmpdir(), `${uuidv4()}.wav`);
    // Pipeline the synthesis stream to a temporary file
    if (audioStream) {
        await pipeline(audioStream, fs.createWriteStream(tempAudioFilePath));
    } else {
        throw new Error("Audio stream is null");
    }
    // キャッシュに保存
    synthesisCache.set(cacheKey, { path: tempAudioFilePath, timestamp: Date.now() });
    return tempAudioFilePath;
}

export function generateUUID() {
    throw new Error("Function not implemented.");
}

export async function play_audio(voiceClient: VoiceConnection, path: string, guildId: string, interaction?: unknown) {
    const player = getPlayer(guildId);
    console.log(`Playing audio for guild: ${guildId}`);
    
    player.on(AudioPlayerStatus.Idle, async () => {
        setTimeout(() => {
            if (player.state.status === AudioPlayerStatus.Idle) {
                voiceClient.disconnect();
            }
        }, 5000); // 5秒後に再度チェックして切断する
    

    while (voiceClient.state.status === VoiceConnectionStatus.Ready && player.state.status === AudioPlayerStatus.Playing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (voiceClient.joinConfig.guildId !== guildId) {
        console.log(`Voice client for guild ${guildId} has changed, stopping playback.`);
        return;
    }

    const resource = await createFFmpegAudioSource(path);
    player.play(resource);
    voiceClient.subscribe(player);
    });
}
    export const AUTO_JOIN_FILE = "auto_join_channels.json";
    export let autoJoinChannelsData: { [key: string]: any } = {};
    autoJoinChannelsData = loadAutoJoinChannels();
    
    export function loadAutoJoinChannels() {
        try {
            return JSON.parse(fs.readFileSync(AUTO_JOIN_FILE, "utf-8"));
        } catch (error) {
            return {};
        }
    }
    
    export function saveAutoJoinChannels() {
        fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannelsData, null, 4), "utf-8");
    }
