import { AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, getVoiceConnection } from "@discordjs/voice";
import * as fs from "fs";
import path from "path";
import os from "os";
import { TextChannel } from "discord.js";
import { randomUUID } from "crypto";
import { getTextChannelForGuild } from './voiceStateManager';
import { getMaxTextLength as getSubscriptionMaxTextLength, isPremiumFeatureAvailable, isProFeatureAvailable, getSubscription, getSubscriptionLimit, checkSubscriptionFeature, SubscriptionType } from './subscription';
import { saveVoiceHistoryItem, VoiceHistoryItem } from './voiceHistory';
import { getVoiceEffectSettings } from './pro-features';

export const textChannels: { [key: string]: TextChannel } = {};
export const voiceClients: { [key: string]: VoiceConnection } = {};
export const currentSpeaker: { [key: string]: number } = {};
export let autoJoinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string } } = {};
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
    audioQuery["volumeScale"] = voiceSettings["volume"]?.[guildId] || 0.5;
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

export async function speakVoice(text: string, speaker: number, guildId: string): Promise<string> {
    // 最大文字数をサブスクリプションベースで取得
    const maxLength = getMaxTextLength(guildId);
    
    // 文字数制限
    const originalText = text; // 履歴用に元のテキストを保存
    if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "...";
    }
    
    try {
        console.log(`音声生成開始: "${text}" (話者ID: ${speaker})`);
        let audioQuery = await postAudioQuery(text, speaker);
        console.log(`音声クエリ取得成功`);
        
        audioQuery = adjustAudioQuery(audioQuery, guildId);
        console.log(`音声合成リクエスト送信`);
        
        const audioContent = await postSynthesis(audioQuery, speaker);
        console.log(`音声合成完了: ${(audioContent as ArrayBuffer).byteLength} バイト`);
        
        const tempAudioFilePath = path.join(os.tmpdir(), `${uuidv4()}.wav`);
        fs.writeFileSync(tempAudioFilePath, Buffer.from(audioContent as ArrayBuffer));
        console.log(`一時ファイル作成: ${tempAudioFilePath}`);
        
        // 成功時に最終発話時間を更新
        updateLastSpeechTime();
        
        // Pro版以上の場合、履歴に保存
        // ...existing code for history saving...
        
        return tempAudioFilePath;
        
    } catch (error) {
        console.error(`音声生成エラー: ${error}`);
        throw error; // エラーを上位に伝播させる
    }
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
        console.log(`ギルド: ${guildId} の音声を再生中, ファイル: ${path}`);

        if (!player) {
            console.error("エラー: ギルド " + guildId + " のオーディオプレイヤーが見つかりませんでした");
            return;
        }

        // 接続チェック
        if (!voiceClient || voiceClient.state.status !== VoiceConnectionStatus.Ready) {
            console.error(`ボイスクライアントが接続されていません。メッセージを無視します。ギルドID: ${guildId}`);
            
            // getVoiceConnection関数で再確認
            const reconnectedClient = getVoiceConnection(guildId);
            if (reconnectedClient && reconnectedClient.state.status === VoiceConnectionStatus.Ready) {
                console.log(`接続を回復しました。ギルドID: ${guildId}`);
                voiceClient = reconnectedClient;
                voiceClients[guildId] = reconnectedClient; // voiceClientsを更新
            } else {
                // 接続なしの場合、ファイルを削除して終了
                if (fs.existsSync(path)) {
                    fs.unlinkSync(path);
                    console.log(`接続なしのため一時ファイルを削除: ${path}`);
                }
                return;
            }
        }

        // 既存のイベントリスナーをクリア (特定のものだけ)
        player.off(AudioPlayerStatus.Idle, () => {});

        // プレイヤーが再生中の場合は待機
        let waitCount = 0;
        while (player.state.status === AudioPlayerStatus.Playing) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
            if (waitCount > 100) { // 10秒経過でタイムアウト
                console.log(`再生待機がタイムアウトしました。次の音声を強制的に再生します。`);
                player.stop(true);
                break;
            }
        }

        if (voiceClient.joinConfig.guildId !== guildId) {
            console.log(`Voice client for guild ${guildId} has changed, stopping playback.`);
            if (fs.existsSync(path)) {
                fs.unlinkSync(path);
                console.log(`不一致のため一時ファイルを削除: ${path}`);
            }
            return;
        }

        // ファイル存在確認
        if (!fs.existsSync(path)) {
            console.error(`音声ファイルが見つかりません: ${path}`);
            return;
        }

        console.log(`音声リソース作成中: ${path}`);
        const resource = await createFFmpegAudioSource(path);
        console.log(`音声再生開始: ${path}`);
        
        // 再生完了後のクリーンアップ関数
        const cleanup = () => {
            try {
                if (fs.existsSync(path)) {
                    fs.unlinkSync(path);
                    console.log(`一時ファイルを削除しました: ${path}`);
                }
                updateLastSpeechTime();
            } catch (cleanupError) {
                console.error(`クリーンアップエラー: ${cleanupError}`);
            }
        };
        
        // エラーハンドラ
        const errorHandler = (error: Error) => {
            console.error(`音声再生エラー: ${error}`);
            cleanup();
        };
        
        player.on('error', errorHandler);
        
        // 通常の再生完了ハンドラ
        return new Promise<void>((resolve) => {
            const onIdle = () => {
                console.log(`音声再生完了: ${path}`);
                player.off('error', errorHandler);
                player.off(AudioPlayerStatus.Idle, onIdle);
                cleanup();
                resolve();
            };
            
            player.once(AudioPlayerStatus.Idle, onIdle);
            
            // タイムアウト設定 (15秒固定)
            const timeout = setTimeout(() => {
                console.log(`音声再生タイムアウト: ${path}`);
                player.off('error', errorHandler);
                player.off(AudioPlayerStatus.Idle, onIdle);
                
                try {
                    player.stop(true);
                } catch (stopError) {
                    console.error(`プレイヤー停止エラー: ${stopError}`);
                }
                
                cleanup();
                resolve();
            }, 15000);
            
            // 再生開始
            try {
                player.play(resource);
                voiceClient.subscribe(player);
            } catch (playError) {
                console.error(`再生開始エラー: ${playError}`);
                clearTimeout(timeout);
                cleanup();
                resolve();
            }
        });
    } catch (error) {
        console.error(`音声再生エラー(全体): ${error}`);
        // エラーが発生した場合もファイル削除を試みる
        try {
            if (fs.existsSync(path)) {
                fs.unlinkSync(path);
                console.log(`エラー後、一時ファイルを削除しました: ${path}`);
            }
        } catch (cleanupError) {
            console.error(`一時ファイル削除エラー: ${cleanupError}`);
        }
    }
}

let autoJoinChannelsData: { [key: string]: any } = {};
// 初期化時に既存のデータを読み込む
autoJoinChannels = loadAutoJoinChannels();

export function loadAutoJoinChannels() {
    try {
        if (fs.existsSync(AUTO_JOIN_FILE)) {
            console.log(`自動参加チャンネル設定を読み込みます: ${AUTO_JOIN_FILE}`);
            const data = fs.readFileSync(AUTO_JOIN_FILE, "utf-8");
            const loadedData = JSON.parse(data);
            
            // 読み込んだデータが有効なオブジェクトであることを確認
            if (loadedData && typeof loadedData === 'object') {
                // 既存のautoJoinChannelsにデータをマージ
                return loadedData;
            }
        }
    } catch (error) {
        console.error("自動参加チャンネル設定読み込みエラー:", error);
    }
    return {};
}

export function saveAutoJoinChannels() {
    try {
        // 既存のデータを読み込む
        let existingData = {};
        if (fs.existsSync(AUTO_JOIN_FILE)) {
            try {
                const data = fs.readFileSync(AUTO_JOIN_FILE, "utf-8");
                existingData = JSON.parse(data);
            } catch (readError) {
                console.error(`既存の自動参加チャンネル設定読み込みエラー: ${readError}`);
                // 読み込みエラーの場合は空のオブジェクトで続行
                existingData = {};
            }
        }

        // autoJoinChannelsの内容を既存データとマージ
        const mergedData = { ...existingData, ...autoJoinChannels };
        
        // マージしたデータを保存
        ensureDirectoryExists(AUTO_JOIN_FILE);
        fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(mergedData, null, 4), "utf-8");
        console.log(`自動参加チャンネル設定を保存しました: ${AUTO_JOIN_FILE}`);
        
        // グローバル変数も更新
        Object.assign(autoJoinChannels, mergedData);
    } catch (error) {
        console.error(`自動参加チャンネル設定保存エラー (${AUTO_JOIN_FILE}):`, error);
    }
}

// 新規：特定のギルドの自動参加設定を更新/追加する関数
export function updateAutoJoinChannel(guildId: string, voiceChannelId: string, textChannelId: string) {
    // 既存の設定を保持したまま特定のギルドの設定だけを更新
    autoJoinChannels[guildId] = { voiceChannelId, textChannelId };
    saveAutoJoinChannels();
}

// 新規：特定のギルドの自動参加設定を削除する関数
export function removeAutoJoinChannel(guildId: string) {
    if (autoJoinChannels[guildId]) {
        delete autoJoinChannels[guildId];
        saveAutoJoinChannels();
        return true;
    }
    return false;
}

// ファイル書き込み時にパスの存在チェックと親ディレクトリ作成を行う関数
function ensureDirectoryExists(filePath: string): void {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
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

/**
 * TTSエンジンの健全性をチェックする
 * @returns TTSエンジンが正常に動作している場合はtrue、そうでない場合はfalse
 */
export function checkTTSHealth(): boolean {
    try {
        // TTSエンジンの状態チェックロジック
        // 例: 必要なリソースにアクセスできるか、最後の発話時間が異常に長くないかなど
        
        // このチェックロジックは実際のTTS実装に合わせて調整してください
        const lastSpeechTime = getLastSpeechTime();
        const currentTime = Date.now();
        
        // 最後の発話から30分以上経っていて、ボイスチャンネルに接続している場合は異常と見なす
        if (currentTime - lastSpeechTime > 30 * 60 * 1000 && isConnectedToVoiceChannels()) {
            console.log(`TTSが${(currentTime - lastSpeechTime) / 60000}分間発話していません。状態を確認してください。`);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('TTSエンジン健全性チェックエラー:', error);
        return false;
    }
}

/**
 * 最後の発話時刻を取得する
 */
let _lastSpeechTime = Date.now();
export function getLastSpeechTime(): number {
    return _lastSpeechTime;
}

/**
 * 発話が行われた際に最終発話時刻を更新する
 */
export function updateLastSpeechTime(): void {
    _lastSpeechTime = Date.now();
}

/**
 * ボイスチャンネルに接続しているかチェックする
 */
function isConnectedToVoiceChannels(): boolean {
    // voiceClientsオブジェクトの中に有効な接続があるかをチェック
    for (const guildId in voiceClients) {
        if (voiceClients[guildId] && voiceClients[guildId].state.status === VoiceConnectionStatus.Ready) {
            return true;
        }
    }
    return false;
}

/**
 * TTSエンジンをリセットする
 */
export function resetTTSEngine(): void {
    try {
        // 現在のTTS状態をクリア
        console.log('TTSエンジンをリセットしています...');
        
        // 必要に応じて既存のリソースをクリーンアップ
        // ...
        
        // 各種初期化関数を再実行
        loadAutoJoinChannels();
        loadJoinChannels();
        AivisAdapter();
        
        // 最終発話時刻をリセット
        _lastSpeechTime = Date.now();
        
        console.log('TTSエンジンのリセット完了');
    } catch (error) {
        console.error('TTSエンジンのリセット中にエラーが発生しました:', error);
        throw error;
    }
}

// 読み上げ優先度の確認関数
export function getTTSPriority(guildId: string): number {
    const subscriptionType = getSubscription(guildId);
    // 優先度が高いほど、キュー内で先に処理される
    return subscriptionType === SubscriptionType.PREMIUM ? 2 :
    subscriptionType === SubscriptionType.PRO ? 1 : 0;
}

// 音声品質の確認関数
export function getVoiceQuality(guildId: string): string {
    return checkSubscriptionFeature(guildId, 'highQualityVoice') ? 'high' : 'standard';
}

// 全ての声優を取得する関数
function getAllVoices() {
    const voices = [];
    
    // speakersデータから声優情報を抽出
    for (const speaker of speakers) {
        if (speaker && speaker.styles && Array.isArray(speaker.styles)) {
            for (const style of speaker.styles) {
                if (style && style.name && style.id !== undefined) {
                    // 声優のティア（無料、Pro、Premium）を決定
                    // NSFWを含む名前はPremium、他は基本無料として例示
                    const tier = speaker.name.includes('NSFW') ? 'premium' : 'free';
                    
                    voices.push({
                        name: `${speaker.name} - ${style.name}`,
                        id: style.id,
                        speakerName: speaker.name,
                        styleName: style.name,
                        tier: tier
                    });
                }
            }
        }
    }
    
    return voices;
}

// 利用可能な声優数の確認
export function getAvailableVoices(guildId: string): string[] {
    const subscriptionType = getSubscription(guildId);
    const allVoices = getAllVoices();
    
    // 基本的な声優リスト
    const freeVoices = allVoices.filter(voice => voice.tier === 'free');
    
    // Proプラン用の声優
    if (subscriptionType === SubscriptionType.PRO) {
        const proVoices = allVoices.filter(voice => 
            voice.tier === 'free' || voice.tier === 'pro'
        );
        return proVoices
            .slice(0, getSubscriptionLimit(guildId, 'maxVoices'))
            .map(voice => voice.name);
    }
    
    // Premiumプラン用の声優
    if (subscriptionType === SubscriptionType.PREMIUM) {
        return allVoices
            .slice(0, getSubscriptionLimit(guildId, 'maxVoices'))
            .map(voice => voice.name);
    }
    
    // 無料プラン
    return freeVoices
        .slice(0, getSubscriptionLimit(guildId, 'maxVoices'))
        .map(voice => voice.name);
}

// メッセージ長の確認
export function validateMessageLength(guildId: string, message: string): boolean {
    const maxLength = getSubscriptionLimit(guildId, 'maxMessageLength');
    return message.length <= maxLength;
}

// 既存のTTS処理関数を拡張
export function processMessage(guildId: string, message: string, options: any) {
    // メッセージ長チェック
    if (!validateMessageLength(guildId, message)) {
        throw new Error(`メッセージが長すぎます。現在のプランでは${getSubscriptionLimit(guildId, 'maxMessageLength')}文字までです。`);
    }
    
    // 音声品質の設定
    options.quality = getVoiceQuality(guildId);
    
    // 優先度の設定
    options.priority = getTTSPriority(guildId);
    
    // Premiumユーザー向けの特殊機能
    if (checkSubscriptionFeature(guildId, 'textTransformationEffects')) {
        message = applyTextTransformations(message, options);
    }
    
    // 既存の処理を続ける
    // ...
}

// テキスト変換エフェクト (Premiumのみ)
function applyTextTransformations(message: string, options: any): string {
    // 実装例: 特殊なマークアップを処理
    // 例: *強調*、#タグ、@メンション など
    
    // この関数ではテキストの変換処理を行う
    return message; // 変換後のテキストを返す
}