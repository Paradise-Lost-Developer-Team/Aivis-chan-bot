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

// デフォルトのスピーカー設定
const DEFAULT_SPEAKERS = [
  {
    "name": "Anneli",
    "speaker_uuid": "e756b8e4-b606-4e15-99b1-3f9c6a1b2317",
    "styles": [
      {
        "name": "ノーマル",
        "id": 888753760,
        "type": "talk"
      },
      {
        "name": "通常",
        "id": 888753761,
        "type": "talk"
      },
      {
        "name": "テンション高め",
        "id": 888753762,
        "type": "talk"
      },
      {
        "name": "落ち着き",
        "id": 888753763,
        "type": "talk"
      },
      {
        "name": "上機嫌",
        "id": 888753764,
        "type": "talk"
      },
      {
        "name": "怒り・悲しみ",
        "id": 888753765,
        "type": "talk"
      }
    ],
    "version": "1.0.0",
    "supported_features": {
      "permitted_synthesis_morphing": "NOTHING"
    }
  },
  {
    "name": "Anneli (NSFW)",
    "speaker_uuid": "9c3114d0-59ce-4576-8110-a6671d3930e1",
    "styles": [
      {
        "name": "ノーマル",
        "id": 1196801504,
        "type": "talk"
      }
    ],
    "version": "1.0.0",
    "supported_features": {
      "permitted_synthesis_morphing": "NOTHING"
    }
  }
];

export const SPEAKERS_FILE = path.join(__dirname, "..", "speakers.json");
export function loadSpeakers() {
    try {
        // 親ディレクトリにあるspeakers.jsonファイルへのパスを正しく設定
        console.log(`スピーカー情報ファイルを読み込みます: ${SPEAKERS_FILE}`);
        
        if (!fs.existsSync(SPEAKERS_FILE)) {
            console.log("speakers.jsonファイルが見つかりません。デフォルト設定を使用します。");
            // デフォルト設定を保存
            fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(DEFAULT_SPEAKERS, null, 2), "utf-8");
            console.log("デフォルトのspeakers.jsonファイルを作成しました。");
            return DEFAULT_SPEAKERS;
        }
        
        const data = fs.readFileSync(SPEAKERS_FILE, "utf-8");
        const speakers = JSON.parse(data);
        
        if (!Array.isArray(speakers) || speakers.length === 0) {
            console.log("speakers.jsonの形式が不正です。デフォルト設定を使用します。");
            return DEFAULT_SPEAKERS;
        }
        
        console.log(`スピーカー情報を読み込みました: ${speakers.length}件のスピーカーが見つかりました`);
        return speakers;
    } catch (error) {
        console.error("スピーカー情報の読み込みでエラーが発生しました:", error);
        return DEFAULT_SPEAKERS;
    }
}

export const speakers = loadSpeakers();

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

export const DICTIONARY_FILE = path.join(__dirname, "..", "guild_dictionaries.json");
let guildDictionary: { [key: string]: any } = {};

try {
    if (fs.existsSync(DICTIONARY_FILE)) {
        guildDictionary = JSON.parse(fs.readFileSync(DICTIONARY_FILE, "utf-8"));
    } else {
        guildDictionary = {};
        // 新規作成
        fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(guildDictionary, null, 2), "utf-8");
    }
} catch (error) {
    console.error("辞書ファイル読み込みエラー:", error);
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

export const AUTO_JOIN_FILE = path.join(__dirname, "..", "auto_join_channels.json");
let autoJoinChannelsData: { [key: string]: any } = {};
autoJoinChannelsData = loadAutoJoinChannels();

export function loadAutoJoinChannels() {
    try {
        if (fs.existsSync(AUTO_JOIN_FILE)) {
            return JSON.parse(fs.readFileSync(AUTO_JOIN_FILE, "utf-8"));
        }
    } catch (error) {
        console.error("自動参加チャンネル設定読み込みエラー:", error);
    }
    return {};
}

export function saveAutoJoinChannels() {
    try {
        fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannels, null, 4), "utf-8");
    } catch (error) {
        console.error("自動参加チャンネル設定保存エラー:", error);
    }
}

export function getSpeakerOptions() {
    try {
        if (!Array.isArray(speakers)) {
            console.error("スピーカー情報が配列ではありません");
            return DEFAULT_SPEAKERS[0].styles.map(style => ({
                label: `${DEFAULT_SPEAKERS[0].name} - ${style.name}`,
                value: `${DEFAULT_SPEAKERS[0].name}-${style.name}-${style.id}`
            }));
        }

        const options = [];
        
        for (const speaker of speakers) {
            if (speaker && speaker.styles && Array.isArray(speaker.styles)) {
                for (const style of speaker.styles) {
                    if (style && style.name && style.id !== undefined) {
                        options.push({
                            label: `${speaker.name} - ${style.name}`,
                            value: `${speaker.name}-${style.name}-${style.id}`
                        });
                    }
                }
            }
        }
        
        if (options.length === 0) {
            console.error("スピーカーオプションが生成できませんでした");
            // デフォルトのオプションを追加
            return [{
                label: "Anneli - ノーマル",
                value: "Anneli-ノーマル-888753760"
            }];
        }
        
        return options;
    } catch (error) {
        console.error("スピーカーオプション生成エラー:", error);
        return [{
            label: "Anneli - ノーマル",
            value: "Anneli-ノーマル-888753760"
        }];
    }
}

// 新規：join_channels.json のパス設定を process.cwd() ベースに変更
export const JOIN_CHANNELS_FILE = path.join(__dirname, "..", "join_channels.json");
let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
joinChannels = loadJoinChannels();

// 新規：join_channels.json を読み込む関数  (ファイルが存在しない場合は空のオブジェクトを返す)
export function loadJoinChannels() {
    try {
        if (fs.existsSync(JOIN_CHANNELS_FILE)) {
            const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error("参加チャンネル設定読み込みエラー:", error);
    }
    return {};
}

// 新規：取得したチャネル情報を保存する関数
export function updateJoinChannelsConfig(guildId: string, voiceChannelId: string, textChannelId: string) {
    let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
    try {
        if (fs.existsSync(JOIN_CHANNELS_FILE)) {
            const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
            joinChannels = JSON.parse(data);
        }
    } catch (error) {
        console.error("参加チャンネル設定読み込みエラー:", error);
        joinChannels = {};
    }
    
    joinChannels[guildId] = { voiceChannelId, textChannelId };
    try {
        fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    } catch (error) {
        console.error("参加チャンネル設定保存エラー:", error);
    }
}

// 新規：join_channels.json を保存する関数
export function saveJoinChannels(joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } }) {
    try {
        fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    } catch (error) {
        console.error("参加チャンネル設定保存エラー:", error);
    }
}

// 新規：チャンネル情報を削除する関数
export function deleteJoinChannelsConfig(guildId: string) {
    let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
    try {
        if (fs.existsSync(JOIN_CHANNELS_FILE)) {
            const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
            joinChannels = JSON.parse(data);
        }
    } catch (error) {
        console.error("参加チャンネル設定読み込みエラー:", error);
        joinChannels = {};
    }
    
    delete joinChannels[guildId];
    try {
        fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    } catch (error) {
        console.error("参加チャンネル設定保存エラー:", error);
    }
}

// メッセージ送信先を決定する関数
export function determineMessageTargetChannel(guildId: string, defaultChannelId?: string) {
  // 保存されたテキストチャンネルIDを優先
  const savedTextChannelId = getTextChannelForGuild(guildId);
  return savedTextChannelId || defaultChannelId;
}