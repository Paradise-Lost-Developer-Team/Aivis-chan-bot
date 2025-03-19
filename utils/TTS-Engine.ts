import { AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, getVoiceConnection } from "@discordjs/voice";
import * as fs from "fs";
import path from "path";
import os from "os";
import { TextChannel } from "discord.js";
import { randomUUID } from "crypto";
import { getTextChannelForGuild } from './voiceStateManager';
import { getMaxTextLength as getSubscriptionMaxTextLength, isPremiumFeatureAvailable, isProFeatureAvailable } from './subscription';
import { saveVoiceHistoryItem, VoiceHistoryItem } from './voiceHistory';

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

// プロジェクトルートディレクトリへのパスを取得する関数
function getProjectRoot(): string {
    // 実行時のディレクトリ構造に基づいてルートパスを計算
    const currentDir = __dirname;
    
    // build/js/utilsパスチェック (Windowsパスとユニックスパス両方に対応)
    if (currentDir.includes('build/js/utils') || currentDir.includes('build\\js\\utils')) {
        // コンパイル後の環境なので、3階層上がルート
        return path.resolve(path.join(currentDir, '..', '..', '..'));
    } else if (currentDir.includes('/utils') || currentDir.includes('\\utils')) {
        // 開発環境なので、1階層上がルート
        return path.resolve(path.join(currentDir, '..'));
    } else {
        // どちらでもない場合はカレントディレクトリを使用
        return process.cwd();
    }
}

// JSONファイルのパスを正しく設定
const PROJECT_ROOT = getProjectRoot();
console.log(`プロジェクトルートディレクトリ: ${PROJECT_ROOT}`);

// 各JSONファイルのパスを確実にプロジェクトルートに設定
export const SPEAKERS_FILE = path.join(PROJECT_ROOT, "speakers.json");
export const DICTIONARY_FILE = path.join(PROJECT_ROOT, "guild_dictionaries.json");
export const AUTO_JOIN_FILE = path.join(PROJECT_ROOT, "auto_join_channels.json");
export const JOIN_CHANNELS_FILE = path.join(PROJECT_ROOT, "join_channels.json");

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

// 最大読み上げ文字数の修正（サブスクリプションに基づく）
export function getMaxTextLength(guildId: string): number {
    return getSubscriptionMaxTextLength(guildId);
}

export async function speakVoice(text: string, speaker: number, guildId: string) {
    // 最大文字数をサブスクリプションベースで取得
    const maxLength = getMaxTextLength(guildId);
    
    // 文字数制限
    const originalText = text; // 履歴用に元のテキストを保存
    if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "...";
    }
    
    let audioQuery = await postAudioQuery(text, speaker);
    audioQuery = adjustAudioQuery(audioQuery, guildId);
    const audioContent = await postSynthesis(audioQuery, speaker);
    const tempAudioFilePath = path.join(os.tmpdir(), `${uuidv4()}.wav`);
    fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent as ArrayBuffer));
    
    // Pro版以上の場合、履歴に保存（ユーザー情報がない場合はスキップ）
    try {
        if (isProFeatureAvailable(guildId)) {
            // システムメッセージかどうかを簡易的に判定
            const isSystemMessage = text.includes('接続しました') || 
                                  text.includes('入室しました') || 
                                  text.includes('退室しました');
            
            if (!isSystemMessage) {
                const historyItem: VoiceHistoryItem = {
                    timestamp: new Date().toISOString(),
                    text: originalText,
                    userId: 'system', // または特定のユーザーID（メッセージ元から取得）
                    username: 'システム', // または特定のユーザー名
                    speakerId: speaker,
                    channelId: '', // 利用可能ならチャンネルID
                    channelName: '' // 利用可能ならチャンネル名
                };
                
                saveVoiceHistoryItem(guildId, historyItem);
            }
        }
    } catch (error) {
        console.error('読み上げ履歴の保存に失敗:', error);
        // 履歴保存の失敗は音声生成には影響させない
    }
    
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
    try {
        const player = getPlayer(guildId);
        console.log(`Playing audio for guild: ${guildId}, file: ${path}`);

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
        let waitCount = 0;
        while (voiceClient.state.status === VoiceConnectionStatus.Ready && 
               player.state.status === AudioPlayerStatus.Playing) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
            if (waitCount > 300) { // 30秒以上待っている場合はタイムアウト
                console.log(`再生待機がタイムアウトしました。次の音声を強制的に再生します。`);
                break;
            }
        }

        if (voiceClient.joinConfig.guildId !== guildId) {
            console.log(`Voice client for guild ${guildId} has changed, stopping playback.`);
            return;
        }

        console.log(`音声リソース作成中: ${path}`);
        const resource = await createFFmpegAudioSource(path);
        console.log(`音声再生開始: ${path}`);
        player.play(resource);
        voiceClient.subscribe(player);
        
        // 再生完了を監視（デバッグ用）
        return new Promise<void>((resolve) => {
            const onIdle = () => {
                console.log(`音声再生完了: ${path}`);
                player.off(AudioPlayerStatus.Idle, onIdle);
                resolve();
            };
            player.once(AudioPlayerStatus.Idle, onIdle);
            
            // 15秒後にタイムアウト
            setTimeout(() => {
                player.off(AudioPlayerStatus.Idle, onIdle);
                console.log(`音声再生タイムアウト: ${path}`);
                resolve();
            }, 15000);
        });
    } catch (error) {
        console.error(`音声再生エラー: ${error}`);
    }
}

let autoJoinChannelsData: { [key: string]: any } = {};
autoJoinChannelsData = loadAutoJoinChannels();

export function loadAutoJoinChannels() {
    try {
        if (fs.existsSync(AUTO_JOIN_FILE)) {
            console.log(`自動参加チャンネル設定を読み込みます: ${AUTO_JOIN_FILE}`);
            return JSON.parse(fs.readFileSync(AUTO_JOIN_FILE, "utf-8"));
        }
    } catch (error) {
        console.error("自動参加チャンネル設定読み込みエラー:", error);
    }
    return {};
}

// ファイル書き込み時にパスの存在チェックと親ディレクトリ作成を行う関数
function ensureDirectoryExists(filePath: string): void {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

export function saveAutoJoinChannels() {
    try {
        ensureDirectoryExists(AUTO_JOIN_FILE);
        fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannels, null, 4), "utf-8");
        console.log(`自動参加チャンネル設定を保存しました: ${AUTO_JOIN_FILE}`);
    } catch (error) {
        console.error(`自動参加チャンネル設定保存エラー (${AUTO_JOIN_FILE}):`, error);
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
let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
joinChannels = loadJoinChannels();

// 新規：join_channels.json を読み込む関数  (ファイルが存在しない場合は空のオブジェクトを返す)
export function loadJoinChannels() {
    try {
        if (fs.existsSync(JOIN_CHANNELS_FILE)) {
            console.log(`参加チャンネル設定を読み込みます: ${JOIN_CHANNELS_FILE}`);
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
        console.error(`参加チャンネル設定読み込みエラー (${JOIN_CHANNELS_FILE}):`, error);
        joinChannels = {};
    }
    
    joinChannels[guildId] = { voiceChannelId, textChannelId };
    try {
        ensureDirectoryExists(JOIN_CHANNELS_FILE);
        fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
        console.log(`参加チャンネル設定を保存しました: ${JOIN_CHANNELS_FILE}`);
    } catch (error) {
        console.error(`参加チャンネル設定保存エラー (${JOIN_CHANNELS_FILE}):`, error);
    }
}

// 新規：join_channels.json を保存する関数
export function saveJoinChannels(joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } }) {
    try {
        ensureDirectoryExists(JOIN_CHANNELS_FILE);
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
        ensureDirectoryExists(JOIN_CHANNELS_FILE);
        fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    } catch (error) {
        console.error(`参加チャンネル設定保存エラー (${JOIN_CHANNELS_FILE}):`, error);
    }
}

// メッセージ送信先を決定する関数
export function determineMessageTargetChannel(guildId: string, defaultChannelId?: string) {
  // 保存されたテキストチャンネルIDを優先
  const savedTextChannelId = getTextChannelForGuild(guildId);
  return savedTextChannelId || defaultChannelId;
}