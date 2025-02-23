import { AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import path from "path";
import os from "os";
import { TextChannel } from "discord.js";
import { adjustAudioQuery } from "./set_voiceSettings";


export function getPlayer(guildId: string): AudioPlayer {
    if (!players[guildId]) {
        players[guildId] = new AudioPlayer();
    }
    return players[guildId];
}

export const textChannels: { [key: string]: TextChannel } = {};
export const voiceClients: { [key: string]: VoiceConnection } = {};
export const currentSpeaker: { [key: string]: number } = {};
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
    const params = new URLSearchParams({ text, speaker: speaker.toString() });
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
        // 分割推論を追加
        const params = new URLSearchParams({ speaker: speaker.toString(), enable_interrogative_upspeak: "true" });
        const requestBody = JSON.stringify(audioQuery);
        console.log('Sending request to synthesis API with params:', params.toString());
        console.log('Request body:', requestBody);

        const response = await fetch(`http://127.0.0.1:10101/synthesis?${params}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(audioQuery)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error in postSynthesis: ${response.statusText} - ${errorText}`);
        }
        return await response.arrayBuffer();
    } catch (error) {
        console.error("Error in postSynthesis:", error);
        throw error;
    }
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
    let audioQuery = await postAudioQuery(text, speaker);
    audioQuery = adjustAudioQuery(audioQuery, guildId);
    const audioContent = await postSynthesis(audioQuery, speaker);
    const tempAudioFilePath = path.join(os.tmpdir(), `${uuidv4()}.wav`);
    fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent));
    return tempAudioFilePath;
}

export function generateUUID() {
    throw new Error("Function not implemented.");
}

export async function play_audio(voiceClient: VoiceConnection, path: string, guildId: string, interaction?: unknown) {
    const player = getPlayer(guildId);
    console.log(`Playing audio for guild: ${guildId}`);
    
    if (player) {
        player.off(AudioPlayerStatus.Idle, () => {
            voiceClient.disconnect();
        });

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
        }
    }

    export const AUTO_JOIN_FILE = "auto_join_channels.json";
    let autoJoinChannelsData: { [key: string]: any } = {};
    autoJoinChannelsData = loadAutoJoinChannels();
    
    export function loadAutoJoinChannels() {
        try {
            return JSON.parse(fs.readFileSync(AUTO_JOIN_FILE, "utf-8"));
        } catch (error) {
            return {};
        }
    }
    
    export function saveAutoJoinChannels() {
        fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannels, null, 4), "utf-8");
    }