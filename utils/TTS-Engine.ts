// @ts-nocheck
import config from '../data/config.json'; // 本番環境用
import { AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, AudioResource, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, joinVoiceChannel, NoSubscriberBehavior, entersState, getVoiceConnection } from "@discordjs/voice";
import * as fs from "fs";
import path from "path";
import { TextChannel } from "discord.js";
import { randomUUID } from "crypto";
import { getTextChannelForGuild } from './voiceStateManager';
import { getMaxTextLength as getSubscriptionMaxTextLength, getSubscription, getSubscriptionLimit, checkSubscriptionFeature, SubscriptionType } from './subscription';
import { Readable } from "stream";
import genericPool from 'generic-pool';
import { spawn, ChildProcess } from "child_process";
import PQueue from 'p-queue';
import fetch from 'node-fetch';
// config.jsonを使う

export const TTS_BASE_URL = process.env.TTS_SERVICE_URL || config.speechEngineUrl;
const TTS_TIMEOUT = config.TTS_TIMEOUT || 15000; // 15秒
const TTS_MAX_RETRIES = config.TTS_MAX_RETRIES || 3;
const TTS_RETRY_DELAY = config.TTS_RETRY_DELAY || 1000;

// TTS自動復旧用フラグと設定
export let ttsAvailable = true; // true = 利用可能、false = 利用不可（検知済み）
let _ttsHealthProbeTimer: NodeJS.Timeout | null = null;
const TTS_HEALTH_CHECK_INTERVAL = (config.TTS_HEALTH_CHECK_INTERVAL_MS as number) || 5000; // ms

function startTTSHealthProbe() {
    if (_ttsHealthProbeTimer) return; // 既に実行中
    console.warn('TTSヘルスプローブを開始します。');
    _ttsHealthProbeTimer = setInterval(async () => {
        try {
            // 簡易ヘルスチェックは /speakers を叩く
            const res = await fetchWithTimeout(`${TTS_BASE_URL}/speakers`, { method: 'GET' }, 3000);
            if (res && res.ok) {
                console.log('TTSサービスが復旧しました。プローブを停止し再初期化を行います。');
                stopTTSHealthProbe();
                ttsAvailable = true;
                try {
                    // 再取得と内部リセット
                    await fetchAndSaveSpeakers();
                } catch (e) {
                    console.warn('復旧時の fetchAndSaveSpeakers に失敗しました:', e);
                }
                try {
                    resetTTSEngine();
                } catch (e) {
                    console.warn('復旧時の resetTTSEngine に失敗しました:', e);
                }
            }
        } catch (e) {
            // まだ復旧していない
        }
    }, TTS_HEALTH_CHECK_INTERVAL);
}

function stopTTSHealthProbe() {
    if (_ttsHealthProbeTimer) {
        clearInterval(_ttsHealthProbeTimer);
        _ttsHealthProbeTimer = null;
    }
}

function markTTSDown() {
    if (!ttsAvailable) return;
    ttsAvailable = false;
    console.error('TTSサービスが利用不可と判断されました。ヘルスプローブを開始します。');
    startTTSHealthProbe();
}

// voiceChannelIdベースで管理
export const textChannels: { [voiceChannelId: string]: TextChannel } = {};
export const voiceClients: { [voiceChannelId: string]: VoiceConnection } = {};
export const currentSpeaker: { [userId: string]: number } = {};
// joinコマンド実行チャンネルを記録するマップ
export const joinCommandChannels: { [guildId: string]: string } = {};
// ユーザーごとの話者設定
export let autoJoinChannels: { [key: string]: { voiceChannelId: string, textChannelId?: string, tempVoice?: boolean, isManualTextChannelId?: boolean } } = {};
export const players: { [voiceChannelId: string]: AudioPlayer } = {};

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

// 各JSONファイルのパスを確実にプロジェクトルート/dataに設定
export const SPEAKERS_FILE = path.join(PROJECT_ROOT, "data", "speakers.json");
export const DICTIONARY_FILE = path.join(PROJECT_ROOT, "data", "guild_dictionaries.json");
export const AUTO_JOIN_FILE = path.join(PROJECT_ROOT, "data", "auto_join_channels.json");
// JOIN_CHANNELS_FILE は動的判定により不要になったため削除

// ユーザーごとの音声設定を永続化するファイル
const USER_VOICE_SETTINGS_FILE = path.join(PROJECT_ROOT, 'data', 'voice_settings.json');

/**
 * ユーザーごとの話者設定を保存
 */

// ユーザーごとの音声設定（話者・音量・音高・感情・話速・テンポ）を保存
export function saveUserVoiceSettings() {
    try {
        // 親ディレクトリを確実に作成し、テンポラリファイルへ書き込んでから原子的にリネームする
        ensureDirectoryExists(USER_VOICE_SETTINGS_FILE);
        const tmpPath = USER_VOICE_SETTINGS_FILE + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(voiceSettings, null, 2), 'utf-8');
        fs.renameSync(tmpPath, USER_VOICE_SETTINGS_FILE);
        console.log(`ユーザー音声設定を保存しました: ${USER_VOICE_SETTINGS_FILE}`);
    } catch (e) {
        console.error('ユーザー音声設定の保存エラー:', e);
    }
}


/**
 * ユーザーごとの話者設定を読み込み
 */

// ユーザーごとの音声設定（話者・音量・音高・感情・話速・テンポ）を読み込み
export function loadUserVoiceSettings() {
    try {
        if (fs.existsSync(USER_VOICE_SETTINGS_FILE)) {
            const data = fs.readFileSync(USER_VOICE_SETTINGS_FILE, 'utf-8');
            const obj = JSON.parse(data);
            Object.assign(voiceSettings, obj);
        }
    } catch (e) {
        console.error('ユーザー音声設定の読み込みエラー:', e);
    }
}

export async function loadSpeakers(): Promise<any[]> {
    try {
        // まず /speakers API から最新情報を取得して JSON ファイルに上書き
        console.log(`スピーカー情報を TTS サービスから取得します: ${TTS_BASE_URL}/speakers`);
        const res = await fetchWithRetry(`${TTS_BASE_URL}/speakers`, { method: "GET" });
        if (res.ok) {
            const remoteSpeakers = await res.json();
            console.log(`取得したスピーカー情報をファイルに保存します: ${SPEAKERS_FILE}`);
            ensureDirectoryExists(SPEAKERS_FILE);
            fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(remoteSpeakers, null, 2), "utf-8");
            return remoteSpeakers;
        } else {
            console.warn(`TTS /speakers API エラー: ${res.status} ${res.statusText}`);
        }
    } catch (err) {
        console.warn("TTS /speakers API からの取得に失敗しました。ローカルデータを使用します。", err);
    }

    // フェールオーバー: ローカル speakers.json もしくはデフォルト
    try {
        console.log(`ローカルファイルからスピーカー情報を読み込みます: ${SPEAKERS_FILE}`);
        if (!fs.existsSync(SPEAKERS_FILE)) {
            console.log("speakers.json が存在しません。デフォルト設定を使用します。");
            ensureDirectoryExists(SPEAKERS_FILE);
            fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(DEFAULT_SPEAKERS, null, 2), "utf-8");
            return DEFAULT_SPEAKERS;
        }
        const data = fs.readFileSync(SPEAKERS_FILE, "utf-8");
        const localSpeakers = JSON.parse(data);
        if (!Array.isArray(localSpeakers) || localSpeakers.length === 0) {
            console.warn("ローカル speakers.json の形式が不正です。デフォルト設定を使用します。");
            return DEFAULT_SPEAKERS;
        }
        return localSpeakers;
    } catch (error) {
        console.error("スピーカー情報の読み込み中にエラーが発生しました:", error);
        return DEFAULT_SPEAKERS;
    }
}

export let speakers: any[] = [];
loadSpeakers().then(data => {
    speakers = data;
}).catch(err => {
    console.error("スピーカー情報初期化エラー:", err);
});

export const voiceSettings: { [key: string]: any } = {
    volume: {},
    pitch: {},
    speed: {},
    intonation: {},
    tempo: {},
    speaker: {} // 追加: ユーザーごとの話者ID
};

export function AivisAdapter() {
    class AivisAdapter {
        URL: string;
        speaker: number;

        constructor() {
            this.URL = TTS_BASE_URL;
            this.speaker = 888753760; // デフォルトの話者ID

            // 起動時にTTSサービス状態を確認
            this.checkServiceHealth()
                .then(isHealthy => {
                    if (isHealthy) {
                        console.log(`TTSサービスに正常に接続しました: ${this.URL}`);
                    } else {
                        console.warn(`TTSサービス(${this.URL})への接続に失敗しました。発話機能が利用できない可能性があります。`);
                    }
                })
                .catch(err => {
                    console.error(`TTSサービス接続確認中にエラーが発生しました: ${err.message}`);
                });

            // synthesis が application/octet-stream を返すかチェック
            this.supportsStreaming()
                .then(sup => {
                    console.log(`synthesis endpoint application/octet-stream 対応: ${sup}`);
                })
                .catch(() => {
                    console.log(`synthesis endpoint 対応チェック失敗`);
                });
        }

        // TTSサービスの健全性チェック
        async checkServiceHealth(): Promise<boolean> {
            try {
                const res = await fetchWithTimeout(`${this.URL}/speakers`, { method: 'GET' }, 5000);
                return res.ok;
            } catch (e) {
                console.error(`TTSサービス健全性チェックエラー: ${e instanceof Error ? e.message : e}`);
                return false;
            }
        }

        // synthesis endpoint が application/octet-stream を返すかチェック
        async supportsStreaming(): Promise<boolean> {
            try {
                // 最小限のボディを送信して Content-Type を確認
                const testBody = {
                    accent_phrases: [],
                    speedScale: 1.0,
                    pitchScale: 0.0,
                    intonationScale: 1.0,
                    volumeScale: 1.0,
                    prePhonemeLength: 0.0,
                    postPhonemeLength: 0.0,
                    outputSamplingRate: 48000,
                    outputStereo: false,
                    kana: ""
                };
                const res = await fetchWithTimeout(
                    `${this.URL}/synthesis?speaker=${this.speaker}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(testBody)
                    },
                    5000
                );
                const ct = res.headers.get('content-type') || '';
                return res.ok && ct.includes('application/octet-stream');
            } catch {
                return false;
            }
        }
    }

    return new AivisAdapter();
}

// AivisSpeech Engine から話者情報を取得して speakers.json に保存
export async function fetchAndSaveSpeakers() {
    const SPEAKERS_FILE = path.join(getProjectRoot(), "data", "speakers.json");
    try {
        const res = await fetch(`${TTS_BASE_URL}/speakers`, { method: "GET" });
        if (!res.ok) throw new Error(`TTS Engine API error: ${res.status}`);
        const speakers = await res.json();
        ensureDirectoryExists(SPEAKERS_FILE);
        fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(speakers, null, 2), "utf-8");
        console.log("AivisSpeech Engineから話者情報を取得しspeakers.jsonに保存しました");
        return speakers;
    } catch (err) {
        console.error("AivisSpeech Engineから話者情報取得に失敗。ローカルspeakers.jsonを使用します。", err);
        if (fs.existsSync(SPEAKERS_FILE)) {
            return JSON.parse(fs.readFileSync(SPEAKERS_FILE, "utf-8"));
        }
        return [];
    }
}

// タイムアウト付きfetch関数
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = TTS_TIMEOUT): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        // node-fetch: body=nullはエラーになるのでundefinedにする
        const fetchOptions: any = { ...options, signal: controller.signal };
        if ('body' in fetchOptions && (fetchOptions.body === null || typeof fetchOptions.body === 'undefined')) {
            delete fetchOptions.body;
        }
        return await fetch(url, fetchOptions);
    } finally {
        clearTimeout(timeoutId);
    }
}

// リトライ機能付きfetch関数
async function fetchWithRetry(url: string, options: RequestInit = {}, retries: number = TTS_MAX_RETRIES): Promise<Response> {
    let lastError: Error | null = null;

    if (!ttsAvailable) {
        throw new Error('TTSサービスは現在利用不可です（ヘルスプローブ実行中）');
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`TTSリクエストリトライ (${attempt}/${retries}): ${url}`);
                await new Promise(resolve => setTimeout(resolve, TTS_RETRY_DELAY));
            }

            // synthesis の場合はストリーミングが長くなり得るためタイムアウトを延長
            const effectiveTimeout = (options as any)?.timeout ?? (url.includes('/synthesis') ? 60000 : TTS_TIMEOUT);
            return await fetchWithTimeout(url, options, effectiveTimeout);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`TTSリクエスト失敗 (${attempt}/${retries}): ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 最後に失敗した場合は TTS が落ちている可能性が高いのでフラグを立ててヘルスプローブを開始
    markTTSDown();
    throw lastError || new Error('リトライ回数を超過しました');
}

// FFmpeg プロセスプール工場（メモリ効率化版）
const ffmpegFactory = {
    create: async (): Promise<ChildProcess> => {
        const ffmpeg = spawn('ffmpeg', [
            '-loglevel', 'error',  // エラーログのみ出力
            '-nostats',            // 進捗統計を抑制
            // ↓ WAV→raw PCM 指定に修正
            '-f', 's16le',        // 生PCM (16bit little endian)
            '-ar', '44100',       // TTS が返すレート
            '-ac', '1',           // モノラル
            '-i', 'pipe:0',
            // 48kHz にリサンプル＆ノイズ除去・フェード
            '-af', 'aresample=48000,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-60dB,afade=t=in:st=0:d=0.03',
            // Opus エンコード設定
            '-c:a', 'libopus',
            '-ar', '48000',        // 出力は Opus のサポートする 48 kHz
            '-b:a', '96k',
            '-vbr', 'on',
            '-application', 'audio',
            '-f', 'ogg',
            'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

        // メモリリーク防止：stderr処理を軽量化
        ffmpeg.stderr?.on('data', chunk => {
            // FFmpegのエラーログは必要最小限のみ出力
            const message = chunk.toString();
            if (message.includes('error') || message.includes('fatal')) {
                console.error('[ffmpeg error]', message.slice(0, 200)); // 200文字に制限
            }
        });
        
        // エラーハンドリング強化
        ffmpeg.stdin?.on('error', err => {
            console.warn('FFmpeg stdin error:', err.message);
            ffmpeg.kill('SIGKILL'); // 強制終了
        });
        ffmpeg.stdout?.on('error', err => {
            console.warn('FFmpeg stdout error:', err.message);
            ffmpeg.kill('SIGKILL'); // 強制終了
        });
        ffmpeg.on('exit', (code, signal) => {
            console.log(`FFmpeg exit code=${code} signal=${signal}`);
        });
        
        // リスナー上限を制限（メモリリーク防止）
        ffmpeg.setMaxListeners(20);
        return ffmpeg;
    },
    destroy: async (cp: ChildProcess) => {
        if (cp.killed) return;
        
        // 段階的な終了処理
        try {
            cp.stdin?.end();
            cp.stdin?.destroy();
            cp.stdout?.destroy();
            cp.stderr?.destroy();
        } catch (e) {
            console.warn('FFmpeg stream cleanup error:', e);
        }
        
        // プロセス終了
        cp.kill('SIGTERM');
        
        // 1秒後に強制終了
        setTimeout(() => {
            if (!cp.killed) {
                cp.kill('SIGKILL');
            }
        }, 1000);
    },
    validate: async (cp: ChildProcess) => {
        return !!(cp.stdin && cp.stdin.writable && cp.stdout && cp.stdout.readable && !cp.killed);
    }
};

const ffmpegPool = genericPool.createPool(ffmpegFactory, {
    min: 1,                         // 最小プロセス数
    max: 3,                         // 最大プロセス数（メモリ効率化のため削減）
    idleTimeoutMillis: 15000,       // アイドルタイムアウト短縮（15秒）    evictionRunIntervalMillis: 5000, // 定期的なプロセス回収間隔（5秒）
    acquireTimeoutMillis: 10000,    // 取得タイムアウト
    testOnBorrow: true,             // 借用時の検証有効
    testOnReturn: true              // 返却時の検証有効
});

// FFmpegプールを使って音声変換を行う（メモリ効率化版）
export async function createFFmpegAudioSource(buffer: Buffer | Uint8Array): Promise<{ resource: AudioResource, ffmpeg: ChildProcess }> {
    const ffmpeg = await ffmpegPool.acquire();
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    // プロセスが死んでいたら再取得
    if (ffmpeg.killed || ffmpeg.exitCode !== null) {
        await ffmpegPool.destroy(ffmpeg);
        return createFFmpegAudioSource(buffer);
    }

    try {
        // 全バッファを一度だけ書き込んで end()（メモリ効率化）
        ffmpeg.stdin?.write(buf);
        ffmpeg.stdin?.end();
        
        // Discord用リソース作成
        const resource = createAudioResource(ffmpeg.stdout!, {
            inputType: StreamType.OggOpus,
            inlineVolume: true,
        });
        resource.volume?.setVolume(1.0);

        // エラーハンドリング強化
        resource.playStream.on('error', (error) => {
            console.error('Audio resource stream error:', error);
            try {
                ffmpegPool.release(ffmpeg).catch(() => {});
            } catch (e) {
                console.warn('FFmpeg pool release error during stream error:', e);
            }
        });

        return { resource, ffmpeg };
    } catch (error) {
        // エラー時はプロセスを即座に破棄
        console.error('createFFmpegAudioSource error:', error);
        try {
            await ffmpegPool.destroy(ffmpeg);
        } catch (e) {
            console.warn('FFmpeg destroy error:', e);
        }
        throw error;
    }
}

export async function postAudioQuery(text: string, speaker: number): Promise<any|null> {
    try {
        const params = new URLSearchParams({ text, speaker: speaker.toString() });
        const response = await fetchWithRetry(`${TTS_BASE_URL}/audio_query?${params}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, speaker })
        });
        if (!response.ok) {
            console.error(`音声クエリ送信エラー: ${response.status} ${response.statusText}`);
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error("音声クエリ送信中にエラーが発生しました:", err);
        return null;
    }
}

export async function postSynthesis(audioQuery: any, speaker: number): Promise<Buffer> {
    try {
    const synthRequestStart = Date.now();
        const params = new URLSearchParams({ speaker: speaker.toString() });
        const response = await fetchWithRetry(`${TTS_BASE_URL}/synthesis?${params}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(audioQuery)
        });
        // 422 は音声化不可のテキスト → 空の Buffer を返す
        if (response.status === 422) {
            console.warn('postSynthesis: Unprocessable Entity, returning empty buffer');
            return Buffer.alloc(0);
        }
        if (!response.ok) {
            throw new Error(`Error in postSynthesis: ${response.statusText}`);
        }
    const arrayBuffer = await response.arrayBuffer();
    const synthRequestEnd = Date.now();
    console.log(`[TTS] postSynthesis: speaker=${speaker} status=${response.status} fetchMs=${synthRequestEnd - synthRequestStart}`);
    return Buffer.from(arrayBuffer);
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

// ローカル辞書のスナップショット取得（軽量キャッシュ）
let _dictCache: any = null;
let _dictMtimeMs = 0;
function getGuildDictionarySnapshot(): any {
    try {
        if (fs.existsSync(DICTIONARY_FILE)) {
            const stat = fs.statSync(DICTIONARY_FILE);
            if (!_dictCache || stat.mtimeMs !== _dictMtimeMs) {
                const raw = fs.readFileSync(DICTIONARY_FILE, 'utf-8');
                _dictCache = JSON.parse(raw) || {};
                _dictMtimeMs = stat.mtimeMs;
            }
        } else {
            _dictCache = {};
            _dictMtimeMs = 0;
        }
    } catch (e) {
        // 壊れた場合は空辞書として扱う
        _dictCache = {};
    }
    return _dictCache || {};
}

// ギルド辞書をテキストへ適用（単純置換: 長い語から順に）
function applyGuildDictionary(guildId: string, text: string): string {
    const dict = getGuildDictionarySnapshot()[guildId];
    if (!dict || typeof dict !== 'object') return text;
    const entries = Object.entries(dict) as Array<[string, any]>;
    if (entries.length === 0) return text;
    // 長い単語から置換して重なりを回避
    entries.sort((a, b) => b[0].length - a[0].length);
    let out = text;
    for (const [word, details] of entries) {
        try {
            const pronunciation = (details && (details as any).pronunciation) || '';
            if (!word || !pronunciation) continue;
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(escaped, 'g');
            out = out.replace(re, pronunciation);
        } catch {}
    }
    return out;
}

export function adjustAudioQuery(audioQuery: any, guildId: string, userId?: string) {
    audioQuery["outputSamplingRate"] = 44100;
    audioQuery["outputStereo"] = false;

    // userIdが指定されていればユーザーごとの設定、なければギルドごとの設定を参照
    let targetId = guildId;
    if (userId && (
        voiceSettings["volume"]?.[userId] !== undefined ||
        voiceSettings["pitch"]?.[userId] !== undefined ||
        voiceSettings["speed"]?.[userId] !== undefined ||
        voiceSettings["intonation"]?.[userId] !== undefined ||
        voiceSettings["tempo"]?.[userId] !== undefined
    )) {
        targetId = String(userId);
    }

    audioQuery["volumeScale"]      = voiceSettings["volume"]?.[targetId]      ?? 1.0;
    audioQuery["pitchScale"]       = voiceSettings["pitch"]?.[targetId]       ?? 0.0;
    audioQuery["speedScale"]       = voiceSettings["speed"]?.[targetId]      ?? voiceSettings["tempo"]?.[targetId] ?? 1.0;
    audioQuery["intonationScale"]  = voiceSettings["intonation"]?.[targetId] ?? 1.0;
    audioQuery["intonationScale"]  = voiceSettings["intonation"]?.[targetId]  ?? 1.0;
    audioQuery["tempoDynamicsScale"] = voiceSettings["tempo"]?.[targetId]     ?? 1.0;
    audioQuery["prePhonemeLength"]  = 0.0;
    audioQuery["postPhonemeLength"] = 0.0;

    return audioQuery;
}

export const MAX_TEXT_LENGTH = 200;

// 最大読み上げ文字数の修正（サブスクリプションに基づく）
export function getMaxTextLength(guildId: string): number {
    return getSubscriptionMaxTextLength(guildId);
}

// 追加：句点読点とコンマとピリオド、半角クエスチョンマークと改行で分割
// チャンク分割：句点(。)、読点(、)、カンマ(,)、ピリオド(. )、半角クエスチョンマーク(?)、改行(\n)
// ただしこれらの文字が連続している場合は分割しない
// 追加：単独記号のみのチャンクを除外
export function chunkText(text: string): string[] {
    return text
        .split(/(?<=[。、,\.?\n])(?![。、,\.?\n])/)
        .map(c => c.trim())
        .filter(chunk => {
            if (!chunk) return false;
            // 単独記号（。 , . ? 改行）だけのチャンクはスキップ
            if (/^[。、,\.?？!！\n]+$/.test(chunk)) return false;
            return true;
        });
}


// 追加：並列チャンク合成＆順次再生（プロファイリング＆maxConcurrency設定対応）
// --- Kubernetes安定化: TTSストリーム先読みバッファ・VC切断遅延・パイプライン化 ---
import { PassThrough } from "stream";
const VC_DISCONNECT_DELAY_MS = 40000; // VC切断遅延（40秒）
let vcDisconnectTimers: { [guildId: string]: NodeJS.Timeout } = {};

// (重複宣言削除済み)

// デフォルト話者ID（Anneli ノーマル）
// export const DEFAULT_SPEAKER_ID = 888753760; // ← 既に上部で宣言済みのため削除

async function speakBufferedChunks(text: string, speakerId: number, guildId: string, maxConcurrency?: number, userId?: string) {
    const limit = getMaxTextLength(guildId);
    if (text.length > limit) {
        text = text.slice(0, limit) + "以下省略";
    }
    // ギルド辞書を適用してから分割
    text = applyGuildDictionary(guildId, text);
    const chunks = chunkText(text);
    if (chunks.length === 0) return;

    // 1つのTTSストリームとして順次パイプライン化
    // VC切断遅延: 新たな再生要求ごとに既存タイマーをクリア（VCはdestroyせずvoiceClientsに保持）
    if (vcDisconnectTimers[guildId]) {
        clearTimeout(vcDisconnectTimers[guildId]);
        delete vcDisconnectTimers[guildId];
    }
    const player = getOrCreateAudioPlayer(guildId);
    const vc = voiceClients[guildId];
    if (vc) vc.subscribe(player);

    // 先読みバッファ（0.7秒分, 48kHz, 16bit, mono = 48000*2*0.7 ≒ 67KB）
    const PREBUFFER_MS = 700;
    const PCM_BYTES_PER_MS = 48 * 2; // 48kHz, 16bit, mono
    const PREBUFFER_SIZE = PCM_BYTES_PER_MS * PREBUFFER_MS;

    // TTSストリームを順次取得し、ffmpegにパイプ（WAV/PCM自動判別）
    const ttsStream = new PassThrough();
    let ended = false;
    let ttsContentType: string | undefined = undefined;
    (async () => {
        let chunkIndex = 0;
        for (const chunk of chunks) {
            let audioQuery = await postAudioQuery(chunk, speakerId);
            if (!audioQuery) continue;
            audioQuery = adjustAudioQuery(audioQuery, guildId, userId);
            // TTSエンジンからストリームを取得
            const params = new URLSearchParams({ speaker: speakerId.toString() });
                const synthFetchStart = Date.now();
                let firstByteRecorded = false;
                const response = await fetchWithRetry(`${TTS_BASE_URL}/synthesis?${params}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(audioQuery)
            });
                const synthFetchEnd = Date.now();
                console.log(`[TTS] synthesis request: guild=${guildId} chunk=${chunkIndex} fetchMs=${synthFetchEnd - synthFetchStart} status=${response.status}`);
            if (!response.ok || !response.body) continue;
            if (!ttsContentType) {
                const ct = response.headers.get('content-type');
                ttsContentType = ct === null ? undefined : ct;
            }
            const nodeStream = response.body as unknown as import('stream').Readable;
            await new Promise<void>((resolve, reject) => {
                if (!nodeStream) return resolve();
                nodeStream.on('data', (chunk: Buffer) => {
                    if (!firstByteRecorded) {
                        firstByteRecorded = true;
                        const firstByteTime = Date.now();
                        console.log(`[TTS] synthesis first byte: guild=${guildId} chunk=${chunkIndex} firstByteMs=${firstByteTime - synthFetchStart}`);
                    }
                    ttsStream.write(chunk);
                });
                nodeStream.on('end', () => resolve());
                nodeStream.on('error', (err: any) => reject(err));
            });
        }
    ended = true;
        ttsStream.end();
    chunkIndex++;
    })();

    // 先読みバッファを貯めてから再生開始
    let prebuffer = Buffer.alloc(0);
    while (prebuffer.length < PREBUFFER_SIZE && !ended) {
        const chunk = ttsStream.read(PREBUFFER_SIZE - prebuffer.length) as Buffer;
        if (chunk) {
            prebuffer = Buffer.concat([prebuffer, chunk]);
        } else {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    // AivisSpeech EngineはWAV出力なので、ffmpeg入力は常にWAV
    const ffmpegArgs = [
        '-loglevel', 'error',
        '-nostats',
        '-f', 'wav',
        '-i', 'pipe:0',
        '-af', 'aresample=48000,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-60dB,afade=t=in:st=0:d=0.03',
        '-c:a', 'libopus',
        '-ar', '48000',
        '-b:a', '96k',
        '-vbr', 'on',
        '-application', 'audio',
        '-f', 'ogg',
        'pipe:1'
    ];
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    ffmpeg.stdin?.write(prebuffer);
    ttsStream.pipe(ffmpeg.stdin!, { end: true });
    const resource = createAudioResource(ffmpeg.stdout!, {
        inputType: StreamType.OggOpus,
        inlineVolume: true,
    });
    resource.volume?.setVolume(1.0);

    const PLAYING_TIMEOUT = 15000;
    const IDLE_TIMEOUT = 120000;
    const onPlayerError = (error: Error) => {
        console.error(`[player error] guild=${guildId}`, error);
    };
    player.once('error', onPlayerError);
    resource.playStream.on('close', () => {
        console.debug(`[resource closed] guild=${guildId}`);
    });
    let playedOnce = false;
    try {
        player.play(resource);
        try {
            await entersState(player, AudioPlayerStatus.Playing, PLAYING_TIMEOUT);
            playedOnce = true;
            await entersState(player, AudioPlayerStatus.Idle, IDLE_TIMEOUT);
        } catch (err) {
            console.error("再生監視でエラー:", err);
            if (!playedOnce) {
                console.log(`再試行: guild=${guildId} - player.play を再実行します`);
                try { player.stop(true); } catch (e) { }
                await new Promise(r => setTimeout(r, 200));
                try {
                    player.play(resource);
                    await entersState(player, AudioPlayerStatus.Playing, PLAYING_TIMEOUT * 2);
                    await entersState(player, AudioPlayerStatus.Idle, IDLE_TIMEOUT);
                } catch (err2) {
                    console.error("再試行時の再生エラー:", err2);
                }
            }
        }
    } finally {
        player.off('error', onPlayerError);
        try { ffmpeg.kill('SIGKILL'); } catch {}
        if (global.gc) global.gc();
    }

    // VC自動切断を無効化（タイマーを設置しない）
}

// ギルドごとにVoiceConnectionを確保・再利用する関数
export function ensureVoiceConnection(guildId: string, voiceChannel: any): VoiceConnection {
    let connection = voiceClients[guildId];
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });
        // ここでリスナー上限を増やす（デフォルト10→50）
        connection.setMaxListeners(50);
        voiceClients[guildId] = connection;
    }
    return connection;
}
async function speakVoiceImpl(text: string, speaker: number, guildId: string, userId?: string, client?: any): Promise<void> {
    let vc = voiceClients[guildId];
    // VoiceConnectionがない or Readyでなければ再接続
    if (!vc || vc.state.status !== VoiceConnectionStatus.Ready) {
        // 再接続にはvoiceChannel情報が必要なので、autoJoinChannelsやjoinChannelsから取得
        const auto = autoJoinChannels[guildId];
        const join = (typeof joinChannels === 'object' ? joinChannels[guildId] : undefined);
        const voiceChannelId = auto?.voiceChannelId || join?.voiceChannelId;
        const guild = client?.guilds?.cache?.get(guildId);
        let voiceChannel = null;
        if (guild && voiceChannelId) {
            voiceChannel = guild.channels.cache.get(voiceChannelId);
        }
        if (voiceChannel) {
            console.log(`[VC DEBUG] ensureVoiceConnection: guildId=${guildId}, channelId=${voiceChannelId}`);
            vc = ensureVoiceConnection(guildId, voiceChannel);
            try {
                console.log(`[VC DEBUG] entersState before: status=${vc.state.status}`);
                await entersState(vc, VoiceConnectionStatus.Ready, 10_000);
                console.log(`[VC DEBUG] entersState after: status=${vc.state.status}`);
            } catch (e) {
                console.warn(`VoiceConnection Ready になりませんでした: status=${vc.state.status}, error=${e}`);
                return;
            }
        } else {
            console.warn(`[VC DEBUG] VoiceConnection/VoiceChannel情報が取得できません: guildId=${guildId}, voiceChannelId=${voiceChannelId}, guild=${!!guild}`);
            return;
        }
    }
    // AudioPlayerを新規作成し、必ずsubscribe
    const player = getOrCreateAudioPlayer(guildId);
    vc.subscribe(player);
    await speakBufferedChunks(text, speaker, guildId, 2, userId);
    return;
}

/**
 * メッセージ読み上げ: ユーザーごとの話者設定を参照
 */
export function speakVoice(text: string, userId: string | number, guildId: string, client?: any): Promise<void> {
    // voiceSettings.speaker優先、なければcurrentSpeaker
    const speaker = (voiceSettings.speaker?.[String(userId)] ?? currentSpeaker[String(userId)]) ?? DEFAULT_SPEAKER_ID;
    const queue = getQueueForUser(guildId);
    return queue.add(() => speakVoiceImpl(text, speaker, guildId, String(userId), client));
}

/**
 * アナウンス用: 必ずデフォルト話者で再生
 */
export function speakAnnounce(text: string, guildId: string, client?: any): Promise<void> {
    const queue = getQueueForUser(guildId);
    return queue.add(() => speakVoiceImpl(text, DEFAULT_SPEAKER_ID, guildId, undefined, client));
}

// ユーザー／ギルドごとのキュー管理
const userQueues = new Map<string, PQueue>();
function getQueueForUser(userId: string): PQueue {
    const plan = getSubscription(userId); // SubscriptionType を取得
    const concurrency = plan === SubscriptionType.PREMIUM ? 4 :
                        plan === SubscriptionType.PRO     ? 2 : 1;
    if (!userQueues.has(userId)) {
        userQueues.set(userId, new PQueue({ concurrency }));
    }
    // 動的に並列数を更新
    const queue = userQueues.get(userId)!;
    queue.concurrency = concurrency;
    return queue;
}

// AudioPlayerごとのサブスクライブ状態を管理するWeakMap
const playerSubscribedMap: WeakMap<AudioPlayer, boolean> = new WeakMap();

// AudioPlayer/VoiceConnectionのリスナー上限を明示的に増やす
export function getPlayer(guildId: string): AudioPlayer {
    if (!players[guildId]) {
        players[guildId] = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        });
        // イベントリスナー上限を増やす（デフォルト10→50）
        players[guildId].setMaxListeners(50);
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
export function isVoiceClientConnected(voiceChannelId: string): boolean {
    if (!voiceClients[voiceChannelId]) {
        return false;
    }
    // VoiceConnectionStatusがReadyであるか確認
    return voiceClients[voiceChannelId].state.status === VoiceConnectionStatus.Ready;
}

let autoJoinChannelsData: { [key: string]: any } = {};
let autoJoinChannelsCache: { [key: string]: any } = {};
let autoJoinChannelsLastModified = 0;

// 初期化時に既存のデータを読み込む（キャッシュ付き）
autoJoinChannels = loadAutoJoinChannels();

export function loadAutoJoinChannels() {
    try {
        if (!fs.existsSync(AUTO_JOIN_FILE)) {
            return autoJoinChannelsCache;
        }

        const stats = fs.statSync(AUTO_JOIN_FILE);
        const lastModified = stats.mtime.getTime();

        // ファイルが変更されていない場合はキャッシュを返す
        if (lastModified === autoJoinChannelsLastModified && Object.keys(autoJoinChannelsCache).length > 0) {
            return autoJoinChannelsCache;
        }

        // ファイルが変更された場合のみ読み込み
        console.log(`[Cache] 自動参加チャンネル設定を読み込みます: ${AUTO_JOIN_FILE}`);
        const data = fs.readFileSync(AUTO_JOIN_FILE, "utf-8");
        const loadedData = JSON.parse(data);
        
        // 読み込んだデータが有効なオブジェクトであることを確認
        if (loadedData && typeof loadedData === 'object') {
            autoJoinChannelsCache = loadedData;
            autoJoinChannelsLastModified = lastModified;
            return loadedData;
        }
    } catch (error) {
        console.error("自動参加チャンネル設定読み込みエラー:", error);
        // エラー時もキャッシュがあれば返す
        if (Object.keys(autoJoinChannelsCache).length > 0) {
            return autoJoinChannelsCache;
        }
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

    // autoJoinChannelsの内容のみで上書き保存
    ensureDirectoryExists(AUTO_JOIN_FILE);
    fs.writeFileSync(AUTO_JOIN_FILE, JSON.stringify(autoJoinChannels, null, 4), "utf-8");
    console.log(`自動参加チャンネル設定を保存しました: ${AUTO_JOIN_FILE}`);
    } catch (error) {
        console.error(`自動参加チャンネル設定保存エラー (${AUTO_JOIN_FILE}):`, error);
    }
}

// 新規：特定のギルドの自動参加設定を更新/追加する関数
export function updateAutoJoinChannel(guildId: string, voiceChannelId: string, textChannelId: string, tempVoice?: boolean) {
    // 既存の設定を保持したまま特定のギルドの設定だけを更新
    autoJoinChannels[guildId] = { voiceChannelId, textChannelId, tempVoice };
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
export let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string, tempVoice?: boolean } } = {};
// join_channels関連のキャッシュは動的判定により不要
// let joinChannelsCache: { [key: string]: { voiceChannelId: string, textChannelId: string, tempVoice?: boolean } } = {};
// let joinChannelsLastModified = 0;

// 新規：auto_join_channels.json を読み込む関数（キャッシュ付き）
autoJoinChannels = loadAutoJoinChannels();

// 新規：join_channels.json を読み込む関数（キャッシュ付き）
export function loadJoinChannels() {
    try {
        if (!fs.existsSync(JOIN_CHANNELS_FILE)) {
            return joinChannelsCache;
        }

        const stats = fs.statSync(JOIN_CHANNELS_FILE);
        const lastModified = stats.mtime.getTime();

        // ファイルが変更されていない場合はキャッシュを返す
        if (lastModified === joinChannelsLastModified && Object.keys(joinChannelsCache).length > 0) {
            return joinChannelsCache;
        }

        // ファイルが変更された場合のみ読み込み
        console.log(`[Cache] 参加チャンネル設定を読み込みます: ${JOIN_CHANNELS_FILE}`);
        const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (parsed && typeof parsed === 'object') {
            joinChannelsCache = parsed;
            joinChannelsLastModified = lastModified;
            return parsed;
        }
    } catch (error) {
        console.error("参加チャンネル設定読み込みエラー:", error);
        // エラー時もキャッシュがあれば返す
        if (Object.keys(joinChannelsCache).length > 0) {
            return joinChannelsCache;
        }
    }
    return {};
}

// 新規：取得したチャネル情報を保存する関数
export function updateJoinChannelsConfig(guildId: string, voiceChannelId: string, textChannelId: string) {
    let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string, tempVoice?: boolean } } = {};
    try {
        if (fs.existsSync(JOIN_CHANNELS_FILE)) {
            const data = fs.readFileSync(JOIN_CHANNELS_FILE, 'utf-8');
            joinChannels = JSON.parse(data);
        }
    } catch (error) {
        console.error(`参加チャンネル設定読み込みエラー (${JOIN_CHANNELS_FILE}):`, error);
        joinChannels = {};
    }
    // tempVoiceはundefinedでOK（従来型もサポート）
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
export function saveJoinChannels(joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string, tempVoice?: boolean } }) {
    try {
        ensureDirectoryExists(JOIN_CHANNELS_FILE);
        fs.writeFileSync(JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    } catch (error) {
        console.error("参加チャンネル設定保存エラー:", error);
    }
}

// 新規：チャンネル情報を削除する関数
export function deleteJoinChannelsConfig(guildId: string) {
    let joinChannels: { [key: string]: { voiceChannelId: string, textChannelId: string, tempVoice?: boolean } } = {};
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

// joinコマンド実行チャンネルを記録する関数
export function setJoinCommandChannel(guildId: string, channelId: string) {
    joinCommandChannels[guildId] = channelId;
    console.log(`[Join:1st] joinコマンド実行チャンネルを記録: guild=${guildId}, channel=${channelId}`);
}

// joinコマンド実行チャンネルを取得する関数
export function getJoinCommandChannel(guildId: string): string | undefined {
    return joinCommandChannels[guildId];
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
        // loadJoinChannels(); // 動的判定により不要
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
                    // 全ての声優は無料
                    voices.push({
                        name: `${speaker.name} - ${style.name}`,
                        id: style.id,
                        speakerName: speaker.name,
                        styleName: style.name,
                        tier: 'free'
                    });
                }
            }
        }
    }
    return voices;
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

// ギルドごとに AudioPlayer を保持
const audioPlayers: Map<string, AudioPlayer> = new Map();

/**
 * 指定ギルドの既存プレイヤーを停止破棄し、
 * 常に新規プレイヤーを生成して返す
 */
export function getOrCreateAudioPlayer(guildId: string): AudioPlayer {
    const prev = audioPlayers.get(guildId);
    if (prev) {
        prev.stop();
        audioPlayers.delete(guildId);
    }
    const player = createAudioPlayer();
    audioPlayers.set(guildId, player);
    return player;
}

/**
 * 指定ギルドの Connection／Player を完全破棄
 */
export function cleanupAudioResources(guildId: string) {
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    const player = audioPlayers.get(guildId);
    if (player) {
        player.stop();
        audioPlayers.delete(guildId);
    }
}

// デフォルト話者ID（Anneli ノーマル）
export const DEFAULT_SPEAKER_ID = 888753760;

// 16bit PCM, 1ch, silence = 0x0000, threshold: 8サンプル連続で無音ならカット
function trimSilence(buffer: Buffer, threshold = 8): Buffer {
    let start = 0;
    let end = buffer.length;
    // 先頭無音
    for (let i = 0; i < buffer.length - threshold * 2; i += 2) {
        let silent = true;
        for (let j = 0; j < threshold * 2; j += 2) {
            if (buffer[i + j] !== 0 || buffer[i + j + 1] !== 0) {
                silent = false;
                break;
            }
        }
        if (!silent) {
            start = i;
            break;
        }
    }
    // 末尾無音
    for (let i = buffer.length - 2; i >= threshold * 2; i -= 2) {
        let silent = true;
        for (let j = 0; j < threshold * 2; j += 2) {
            if (buffer[i - j] !== 0 || buffer[i - j + 1] !== 0) {
                silent = false;
                break;
            }
        }
        if (!silent) {
            end = i + 2;
            break;
        }
    }
    return buffer.slice(start, end);
}

// メモリ使用量監視とガベージコレクション制御
let lastMemoryCheck = 0;
const MEMORY_CHECK_INTERVAL = 30000; // 30秒間隔

export function monitorMemoryUsage() {
    const now = Date.now();
    if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL) return;
    
    lastMemoryCheck = now;
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);
    
    console.log(`メモリ使用量: Heap ${heapUsedMB}/${heapTotalMB}MB, RSS ${rssUsedMB}MB`);
    
    // メモリ使用量が高い場合の対策
    if (heapUsedMB > 512) { // 512MB超過時
        console.warn(`メモリ使用量が高いです (${heapUsedMB}MB) - ガベージコレクション実行`);
        if (global.gc) {
            global.gc();
        }
        
        // FFmpegプールのアイドルプロセスを削減
        try {
            ffmpegPool.clear().catch(() => {});
            console.log('FFmpegプールをクリアしました');
        } catch (e) {
            console.warn('FFmpegプールクリアエラー:', e);
        }
    }
}

// 定期的なメモリ監視を開始
setInterval(monitorMemoryUsage, MEMORY_CHECK_INTERVAL);

// プロセス終了時のクリーンアップ
process.on('exit', () => {
    console.log('プロセス終了: FFmpegプールをクリーンアップ中...');
    try {
        ffmpegPool.drain().then(() => ffmpegPool.clear());
    } catch (e) {
        console.warn('終了時クリーンアップエラー:', e);
    }
});

process.on('SIGINT', () => {
    console.log('SIGINT受信: FFmpegプールをクリーンアップ中...');
    try {
        ffmpegPool.drain().then(() => ffmpegPool.clear()).finally(() => process.exit(0));
    } catch (e) {
        console.warn('SIGINT時クリーンアップエラー:', e);
        process.exit(0);
    }
});

process.on('SIGTERM', () => {
    console.log('SIGTERM受信: FFmpegプールをクリーンアップ中...');
    try {
        ffmpegPool.drain().then(() => ffmpegPool.clear()).finally(() => process.exit(0));
    } catch (e) {
        console.warn('SIGTERM時クリーンアップエラー:', e);
        process.exit(0);
    }
});