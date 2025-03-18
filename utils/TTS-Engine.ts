import { AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, getVoiceConnection } from "@discordjs/voice";
import * as fs from "fs";
import path from "path";
import os from "os";
import { TextChannel } from "discord.js";
import { randomUUID } from "crypto";
import { getTextChannelForGuild } from './voiceStateManager';

export const textChannels: { [key: string]: TextChannel } = {};
export const voiceClients: { [key: string]: VoiceConnection } = {};
export const currentSpeaker: { [key: string]: number } = {};
export const autoJoinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
export const players: { [key: string]: AudioPlayer } = {};
export const speakers = loadSpeakers();

export const SPEAKERS_FILE = "speakers.json";
export function loadSpeakers() {
    try {
        const data = fs.readFileSync(SPEAKERS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

export const voiceSettings: { [key: string]: any } = {
    volume: {},
    pitch: {},
    rate: {},
    speed: {},
    style_strength: {},
    tempo: {}
};

export function AivisAdapter() {
    class AivisAdapter {
        URL: string;
        speaker: number;

        constructor() {
            this.URL = "http://127.0.0.1:10101";
            this.speaker = 0; // 話者IDを設定
        }
    }
    return new AivisAdapter();
}


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
        return await response.json();
    } catch (error) {
        console.error("Error in postAudioQuery:", error);
        throw error;
    }
}

export async function postSynthesis(audioQuery: any, speaker: number) {
    try {
        // 分割推論のためのパラメータを追加
        const params = new URLSearchParams({ speaker: speaker.toString(), enable_interrogative_upspeak: "true" });
        const response = await fetch(`http://127.0.0.1:10101/synthesis?${params}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(audioQuery)
        });
        if (!response.ok) {
            throw new Error(`Error in postSynthesis: ${response.statusText}`);
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

export function adjustAudioQuery(audioQuery: any, guildId: string) {
    audioQuery["volumeScale"] = voiceSettings["volume"]?.[guildId] || 0.2;
    audioQuery["pitchScale"] = voiceSettings["pitch"]?.[guildId] || 0.0;
    audioQuery["rateScale"] = voiceSettings["rate"]?.[guildId] || 1.0;
    audioQuery["speedScale"] = voiceSettings["speed"]?.[guildId] || 1.0;
    audioQuery["styleStrength"] = voiceSettings["style_strength"]?.[guildId] || 1.0;
    audioQuery["tempoScale"] = voiceSettings["tempo"]?.[guildId] || 1.0;
    return audioQuery;
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
    fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent as ArrayBuffer));
    return tempAudioFilePath;
}

export function getPlayer(guildId: string): AudioPlayer {
    if (!players[guildId]) {
        players[guildId] = createAudioPlayer();
    }
    return players[guildId];
}

export function uuidv4(): string {
    // Node.js の randomUUID が利用可能な場合はそれを使用
    if (typeof randomUUID === "function") {
        return randomUUID();
    }
    // 利用できない場合は簡易実装
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ボイスクライアント接続チェックを行う関数を追加
export function isVoiceClientConnected(guildId: string): boolean {
    if (!voiceClients[guildId]) {
        return false;
    }
    
    // VoiceConnectionStatusがReadyであるか確認
    return voiceClients[guildId].state.status === VoiceConnectionStatus.Ready;
}

export async function play_audio(voiceClient: VoiceConnection, path: string, guildId: string, interaction: any) {
    const player = getPlayer(guildId);
    console.log(`Playing audio for guild: ${guildId}`);

    if (!player) {
        console.error("Error: No audio player found for guild " + guildId);
        return;
    }

    // 接続チェック
    if (!voiceClient || voiceClient.state.status !== VoiceConnectionStatus.Ready) {
        console.error(`Voice client is not connected. Ignoring message. Guild ID: ${guildId}`);
        
        // getVoiceConnection関数で再確認
        const reconnectedClient = getVoiceConnection(guildId);
        if (reconnectedClient && reconnectedClient.state.status === VoiceConnectionStatus.Ready) {
            console.log(`接続を回復しました。ギルドID: ${guildId}`);
            voiceClient = reconnectedClient;
            voiceClients[guildId] = reconnectedClient; // voiceClientsを更新
        } else {
            return; // 接続できなければ終了
        }
    }

    // 既存のIdleイベントリスナーを解除
    player.off(AudioPlayerStatus.Idle, () => {
        voiceClient.disconnect();
    });

    // プレイヤーが再生中の場合は待機
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

export function getSpeakerOptions() {
    const options = [];
    for (const speaker of speakers) {
        for (const style of speaker.styles) {
            options.push({ label: `${speaker.name} - ${style.name}`, value: `${speaker.name}-${style.name}-${style.id}` });
        }
    }
    return options;
}

// 新規：join_channels.json のパス設定を process.cwd() ベースに変更
export const JOIN_CHANNELS_FILE = 'join_channels.json';
let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
joinChannels = loadJoinChannels();

// 新規：join_channels.json を読み込む関数  (ファイルが存在しない場合は空のオブジェクトを返す)
export function loadJoinChannels() {
    try {
        const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// 新規：取得したチャネル情報を保存する関数
export function updateJoinChannelsConfig(guildId: string, voiceChannelId: string, textChannelId: string) {
    let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
    try {
        const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
        joinChannels = JSON.parse(data);
    } catch (error) {
        joinChannels = {};
    }
    joinChannels[guildId] = { voiceChannelId, textChannelId };
    fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
}

// 新規：join_channels.json を保存する関数
export function saveJoinChannels(joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } }) {
    fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
}

// 新規：チャンネル情報を削除する関数
export function deleteJoinChannelsConfig(guildId: string) {
    let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
    try {
        const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
        joinChannels = JSON.parse(data);
    } catch (error) {
        joinChannels = {};
    }
    delete joinChannels[guildId];
    fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
}

// メッセージ送信先を決定する関数
export function determineMessageTargetChannel(guildId: string, defaultChannelId?: string) {
  // 保存されたテキストチャンネルIDを優先
  const savedTextChannelId = getTextChannelForGuild(guildId);
  return savedTextChannelId || defaultChannelId;
}