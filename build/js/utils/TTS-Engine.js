"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SPEAKER_ID = exports.MAX_TEXT_LENGTH = exports.voiceSettings = exports.speakers = exports.JOIN_CHANNELS_FILE = exports.AUTO_JOIN_FILE = exports.DICTIONARY_FILE = exports.SPEAKERS_FILE = exports.players = exports.autoJoinChannels = exports.currentSpeaker = exports.voiceClients = exports.textChannels = void 0;
exports.saveUserSpeakers = saveUserSpeakers;
exports.loadUserSpeakers = loadUserSpeakers;
exports.loadSpeakers = loadSpeakers;
exports.AivisAdapter = AivisAdapter;
exports.fetchAndSaveSpeakers = fetchAndSaveSpeakers;
exports.createFFmpegAudioSource = createFFmpegAudioSource;
exports.postAudioQuery = postAudioQuery;
exports.postSynthesis = postSynthesis;
exports.adjustAudioQuery = adjustAudioQuery;
exports.getMaxTextLength = getMaxTextLength;
exports.ensureVoiceConnection = ensureVoiceConnection;
exports.speakVoice = speakVoice;
exports.speakAnnounce = speakAnnounce;
exports.getPlayer = getPlayer;
exports.uuidv4 = uuidv4;
exports.isVoiceClientConnected = isVoiceClientConnected;
exports.loadAutoJoinChannels = loadAutoJoinChannels;
exports.saveAutoJoinChannels = saveAutoJoinChannels;
exports.updateAutoJoinChannel = updateAutoJoinChannel;
exports.removeAutoJoinChannel = removeAutoJoinChannel;
exports.getSpeakerOptions = getSpeakerOptions;
exports.loadJoinChannels = loadJoinChannels;
exports.updateJoinChannelsConfig = updateJoinChannelsConfig;
exports.saveJoinChannels = saveJoinChannels;
exports.deleteJoinChannelsConfig = deleteJoinChannelsConfig;
exports.determineMessageTargetChannel = determineMessageTargetChannel;
exports.checkTTSHealth = checkTTSHealth;
exports.getLastSpeechTime = getLastSpeechTime;
exports.updateLastSpeechTime = updateLastSpeechTime;
exports.resetTTSEngine = resetTTSEngine;
exports.getTTSPriority = getTTSPriority;
exports.getVoiceQuality = getVoiceQuality;
exports.getAvailableVoices = getAvailableVoices;
exports.validateMessageLength = validateMessageLength;
exports.processMessage = processMessage;
exports.getOrCreateAudioPlayer = getOrCreateAudioPlayer;
exports.cleanupAudioResources = cleanupAudioResources;
const voice_1 = require("@discordjs/voice");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const voiceStateManager_1 = require("./voiceStateManager");
const subscription_1 = require("./subscription");
const generic_pool_1 = __importDefault(require("generic-pool"));
const child_process_1 = require("child_process");
const p_queue_1 = __importDefault(require("p-queue"));
const node_fetch_1 = __importDefault(require("node-fetch"));
// TTS設定のデフォルト値（config.jsonに依存しない）
const TTS_HOST = "127.0.0.1";
const TTS_PORT = 10101;
const TTS_BASE_URL = `http://${TTS_HOST}:${TTS_PORT}`;
const TTS_TIMEOUT = 15000; // 15秒
const TTS_MAX_RETRIES = 3;
const TTS_RETRY_DELAY = 1000;
exports.textChannels = {};
exports.voiceClients = {};
exports.currentSpeaker = {};
// ユーザーごとの話者設定
exports.autoJoinChannels = {};
exports.players = {};
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
function getProjectRoot() {
    // 実行時のディレクトリ構造に基づいてルートパスを計算
    const currentDir = __dirname;
    // build/js/utilsパスチェック (Windowsパスとユニックスパス両方に対応)
    if (currentDir.includes('build/js/utils') || currentDir.includes('build\\js\\utils')) {
        // コンパイル後の環境なので、3階層上がルート
        return path_1.default.resolve(path_1.default.join(currentDir, '..', '..', '..'));
    }
    else if (currentDir.includes('/utils') || currentDir.includes('\\utils')) {
        // 開発環境なので、1階層上がルート
        return path_1.default.resolve(path_1.default.join(currentDir, '..'));
    }
    else {
        // どちらでもない場合はカレントディレクトリを使用
        return process.cwd();
    }
}
// JSONファイルのパスを正しく設定
const PROJECT_ROOT = getProjectRoot();
console.log(`プロジェクトルートディレクトリ: ${PROJECT_ROOT}`);
// 各JSONファイルのパスを確実にプロジェクトルート/dataに設定
exports.SPEAKERS_FILE = path_1.default.join(PROJECT_ROOT, "data", "speakers.json");
exports.DICTIONARY_FILE = path_1.default.join(PROJECT_ROOT, "data", "guild_dictionaries.json");
exports.AUTO_JOIN_FILE = path_1.default.join(PROJECT_ROOT, "data", "auto_join_channels.json");
exports.JOIN_CHANNELS_FILE = path_1.default.join(PROJECT_ROOT, "data", "join_channels.json");
// ユーザーごとの話者設定を永続化するファイル
const USER_SPEAKERS_FILE = path_1.default.join(PROJECT_ROOT, 'data', 'user_speakers.json');
/**
 * ユーザーごとの話者設定を保存
 */
function saveUserSpeakers() {
    try {
        fs.writeFileSync(USER_SPEAKERS_FILE, JSON.stringify(exports.currentSpeaker, null, 2), 'utf-8');
    }
    catch (e) {
        console.error('ユーザー話者設定の保存エラー:', e);
    }
}
/**
 * ユーザーごとの話者設定を読み込み
 */
function loadUserSpeakers() {
    try {
        if (fs.existsSync(USER_SPEAKERS_FILE)) {
            const data = fs.readFileSync(USER_SPEAKERS_FILE, 'utf-8');
            const obj = JSON.parse(data);
            Object.assign(exports.currentSpeaker, obj);
        }
    }
    catch (e) {
        console.error('ユーザー話者設定の読み込みエラー:', e);
    }
}
async function loadSpeakers() {
    try {
        // まず /speakers API から最新情報を取得して JSON ファイルに上書き
        console.log(`スピーカー情報を TTS サービスから取得します: ${TTS_BASE_URL}/speakers`);
        const res = await fetchWithRetry(`${TTS_BASE_URL}/speakers`, { method: "GET" });
        if (res.ok) {
            const remoteSpeakers = await res.json();
            console.log(`取得したスピーカー情報をファイルに保存します: ${exports.SPEAKERS_FILE}`);
            ensureDirectoryExists(exports.SPEAKERS_FILE);
            fs.writeFileSync(exports.SPEAKERS_FILE, JSON.stringify(remoteSpeakers, null, 2), "utf-8");
            return remoteSpeakers;
        }
        else {
            console.warn(`TTS /speakers API エラー: ${res.status} ${res.statusText}`);
        }
    }
    catch (err) {
        console.warn("TTS /speakers API からの取得に失敗しました。ローカルデータを使用します。", err);
    }
    // フェールオーバー: ローカル speakers.json もしくはデフォルト
    try {
        console.log(`ローカルファイルからスピーカー情報を読み込みます: ${exports.SPEAKERS_FILE}`);
        if (!fs.existsSync(exports.SPEAKERS_FILE)) {
            console.log("speakers.json が存在しません。デフォルト設定を使用します。");
            ensureDirectoryExists(exports.SPEAKERS_FILE);
            fs.writeFileSync(exports.SPEAKERS_FILE, JSON.stringify(DEFAULT_SPEAKERS, null, 2), "utf-8");
            return DEFAULT_SPEAKERS;
        }
        const data = fs.readFileSync(exports.SPEAKERS_FILE, "utf-8");
        const localSpeakers = JSON.parse(data);
        if (!Array.isArray(localSpeakers) || localSpeakers.length === 0) {
            console.warn("ローカル speakers.json の形式が不正です。デフォルト設定を使用します。");
            return DEFAULT_SPEAKERS;
        }
        return localSpeakers;
    }
    catch (error) {
        console.error("スピーカー情報の読み込み中にエラーが発生しました:", error);
        return DEFAULT_SPEAKERS;
    }
}
exports.speakers = [];
loadSpeakers().then(data => {
    exports.speakers = data;
}).catch(err => {
    console.error("スピーカー情報初期化エラー:", err);
});
exports.voiceSettings = {
    volume: {},
    pitch: {},
    speed: {},
    intonation: {},
    tempo: {}
};
function AivisAdapter() {
    class AivisAdapter {
        constructor() {
            this.URL = TTS_BASE_URL;
            this.speaker = 888753760; // デフォルトの話者ID
            // 起動時にTTSサービス状態を確認
            this.checkServiceHealth()
                .then(isHealthy => {
                if (isHealthy) {
                    console.log(`TTSサービスに正常に接続しました: ${this.URL}`);
                }
                else {
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
        async checkServiceHealth() {
            try {
                const res = await fetchWithTimeout(`${this.URL}/speakers`, { method: 'GET' }, 5000);
                return res.ok;
            }
            catch (e) {
                console.error(`TTSサービス健全性チェックエラー: ${e instanceof Error ? e.message : e}`);
                return false;
            }
        }
        // synthesis endpoint が application/octet-stream を返すかチェック
        async supportsStreaming() {
            try {
                // 最小限のボディを送信して Content-Type を確認
                const testBody = {
                    accent_phrases: [],
                    speedScale: 1.0,
                    pitchScale: 0.0,
                    intonationScale: 1.0,
                    volumeScale: 1.0,
                    prePhonemeLength: 0.1,
                    postPhonemeLength: 0.1,
                    outputSamplingRate: 48000,
                    outputStereo: false,
                    kana: ""
                };
                const res = await fetchWithTimeout(`${this.URL}/synthesis?speaker=${this.speaker}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(testBody)
                }, 5000);
                const ct = res.headers.get('content-type') || '';
                return res.ok && ct.includes('application/octet-stream');
            }
            catch {
                return false;
            }
        }
    }
    return new AivisAdapter();
}
// AivisSpeech Engine から話者情報を取得して speakers.json に保存
async function fetchAndSaveSpeakers() {
    const TTS_HOST = "127.0.0.1";
    const TTS_PORT = 10101;
    const TTS_BASE_URL = `http://${TTS_HOST}:${TTS_PORT}`;
    const SPEAKERS_FILE = path_1.default.join(getProjectRoot(), "data", "speakers.json");
    try {
        const res = await (0, node_fetch_1.default)(`${TTS_BASE_URL}/speakers`, { method: "GET" });
        if (!res.ok)
            throw new Error(`TTS Engine API error: ${res.status}`);
        const speakers = await res.json();
        ensureDirectoryExists(SPEAKERS_FILE);
        fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(speakers, null, 2), "utf-8");
        console.log("AivisSpeech Engineから話者情報を取得しspeakers.jsonに保存しました");
        return speakers;
    }
    catch (err) {
        console.error("AivisSpeech Engineから話者情報取得に失敗。ローカルspeakers.jsonを使用します。", err);
        if (fs.existsSync(SPEAKERS_FILE)) {
            return JSON.parse(fs.readFileSync(SPEAKERS_FILE, "utf-8"));
        }
        return [];
    }
}
// タイムアウト付きfetch関数
async function fetchWithTimeout(url, options = {}, timeout = TTS_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        // node-fetch: body=nullはエラーになるのでundefinedにする
        const fetchOptions = { ...options, signal: controller.signal };
        if ('body' in fetchOptions && (fetchOptions.body === null || typeof fetchOptions.body === 'undefined')) {
            delete fetchOptions.body;
        }
        return await (0, node_fetch_1.default)(url, fetchOptions);
    }
    finally {
        clearTimeout(timeoutId);
    }
}
// リトライ機能付きfetch関数
async function fetchWithRetry(url, options = {}, retries = TTS_MAX_RETRIES) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`TTSリクエストリトライ (${attempt}/${retries}): ${url}`);
                await new Promise(resolve => setTimeout(resolve, TTS_RETRY_DELAY));
            }
            return await fetchWithTimeout(url, options);
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`TTSリクエスト失敗 (${attempt}/${retries}): ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    throw lastError || new Error('リトライ回数を超過しました');
}
// FFmpeg プロセスプール工場
const ffmpegFactory = {
    create: async () => {
        const ffmpeg = (0, child_process_1.spawn)('ffmpeg', [
            '-loglevel', 'error', // エラーログのみ出力
            '-nostats', // 進捗統計を抑制
            // ↓ WAV→raw PCM 指定に修正
            '-f', 's16le', // 生PCM (16bit little endian)
            '-ar', '44100', // TTS が返すレート
            '-ac', '1', // モノラル
            '-i', 'pipe:0',
            // 48kHz にリサンプル＆ノイズ除去・フェード
            '-af', 'aresample=48000,silenceremove=start_periods=1:start_silence=0.02:start_threshold=-60dB,afade=t=in:st=0:d=0.03',
            // Opus エンコード設定
            '-c:a', 'libopus',
            '-ar', '48000', // 出力は Opus のサポートする 48 kHz
            '-b:a', '96k',
            '-vbr', 'on',
            '-application', 'audio',
            '-f', 'ogg',
            'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
        // 追加：stderr を全て拾う
        ffmpeg.stderr?.on('data', chunk => {
            console.error('[ffmpeg stderr]', chunk.toString());
        });
        ffmpeg.stdin?.on('error', err => console.warn('stdin error:', err));
        ffmpeg.stdout?.on('error', err => console.warn('stdout error:', err));
        ffmpeg.on('exit', (code, signal) => {
            console.error(`FFmpeg exit code=${code} signal=${signal}`);
        });
        ffmpeg.setMaxListeners(50);
        return ffmpeg;
    },
    destroy: async (cp) => {
        if (cp.killed)
            return;
        cp.kill();
    },
    validate: async (cp) => !!(cp.stdin && cp.stdin.writable && cp.stdout && cp.stdout.readable)
};
const ffmpegPool = generic_pool_1.default.createPool(ffmpegFactory, {
    min: 1,
    max: 4,
    idleTimeoutMillis: 30000,
    evictionRunIntervalMillis: 10000
});
// FFmpegプールを使って音声変換を行う
async function createFFmpegAudioSource(buffer) {
    const ffmpeg = await ffmpegPool.acquire();
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    // プロセスが死んでいたら再取得
    if (ffmpeg.killed || ffmpeg.exitCode !== null) {
        await ffmpegPool.destroy(ffmpeg);
        return createFFmpegAudioSource(buffer);
    }
    // ---- ここから修正部分 ----
    // 以前: 20msごとのチャンク送信でフィルタが何度もリセットされていた
    // const input = createChunkedStream(buf, 1920);
    // input.pipe(ffmpeg.stdin!, { end: true });
    // 修正: 全バッファを一度だけ書き込んで end()
    ffmpeg.stdin?.write(buf);
    ffmpeg.stdin?.end();
    // ---- 修正ここまで ----
    // Discord用リソース作成
    const resource = (0, voice_1.createAudioResource)(ffmpeg.stdout, {
        inputType: voice_1.StreamType.OggOpus,
        inlineVolume: true,
    });
    resource.volume?.setVolume(1.0);
    // 再生終了後にプールへ返却する責任は呼び出し元
    return { resource, ffmpeg };
}
async function postAudioQuery(text, speaker) {
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
    }
    catch (err) {
        console.error("音声クエリ送信中にエラーが発生しました:", err);
        return null;
    }
}
async function postSynthesis(audioQuery, speaker) {
    try {
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
        return Buffer.from(arrayBuffer);
    }
    catch (error) {
        console.error("Error in postSynthesis:", error);
        throw error;
    }
}
let guildDictionary = {};
try {
    if (fs.existsSync(exports.DICTIONARY_FILE)) {
        guildDictionary = JSON.parse(fs.readFileSync(exports.DICTIONARY_FILE, "utf-8"));
    }
    else {
        guildDictionary = {};
        // 新規作成
        fs.writeFileSync(exports.DICTIONARY_FILE, JSON.stringify(guildDictionary, null, 2), "utf-8");
    }
}
catch (error) {
    console.error("辞書ファイル読み込みエラー:", error);
    guildDictionary = {};
}
function adjustAudioQuery(audioQuery, guildId, userId) {
    // 追加：必ず 44.1kHz, モノラルで出力させる
    audioQuery["outputSamplingRate"] = 44100;
    audioQuery["outputStereo"] = false;
    // userIdが指定されていればユーザーごとの設定、なければギルドごとの設定を参照
    let targetId = guildId;
    if (userId && (exports.voiceSettings["volume"]?.[userId] !== undefined ||
        exports.voiceSettings["pitch"]?.[userId] !== undefined ||
        exports.voiceSettings["speed"]?.[userId] !== undefined ||
        exports.voiceSettings["intonation"]?.[userId] !== undefined ||
        exports.voiceSettings["tempo"]?.[userId] !== undefined)) {
        targetId = String(userId);
    }
    audioQuery["volumeScale"] = exports.voiceSettings["volume"]?.[targetId] ?? 0.5;
    audioQuery["pitchScale"] = exports.voiceSettings["pitch"]?.[targetId] ?? 0.0;
    audioQuery["speedScale"] = exports.voiceSettings["speed"]?.[targetId] ?? 1.0;
    audioQuery["intonationScale"] = exports.voiceSettings["intonation"]?.[targetId] ?? 1.0;
    audioQuery["tempoDynamicsScale"] = exports.voiceSettings["tempo"]?.[targetId] ?? 1.0;
    return audioQuery;
}
exports.MAX_TEXT_LENGTH = 200;
// 最大読み上げ文字数の修正（サブスクリプションに基づく）
function getMaxTextLength(guildId) {
    return (0, subscription_1.getMaxTextLength)(guildId);
}
// 追加：句点読点とコンマとピリオド、半角クエスチョンマークと改行で分割
// チャンク分割：句点(。)、読点(、)、カンマ(,)、ピリオド(. )、半角クエスチョンマーク(?)、改行(\n)
// ただしこれらの文字が連続している場合は分割しない
// 追加：単独記号のみのチャンクを除外
function chunkText(text) {
    return text
        .split(/(?<=[。、,\.?\n])(?![。、,\.?\n])/)
        .map(c => c.trim())
        .filter(chunk => {
        if (!chunk)
            return false;
        // 単独記号（。 , . ? 改行）だけのチャンクはスキップ
        if (/^[。、,\.?？!！\n]+$/.test(chunk))
            return false;
        return true;
    });
}
// 追加：並列チャンク合成＆順次再生
async function speakBufferedChunks(text, speakerId, guildId, maxConcurrency = 1, userId) {
    const limit = getMaxTextLength(guildId);
    if (text.length > limit) {
        text = text.slice(0, limit) + "以下省略";
    }
    const chunks = chunkText(text);
    console.log("チャンク分割結果:", chunks); // デバッグ用
    // チャンクごとに合成
    const results = new Array(chunks.length);
    let currentIndex = 0;
    await Promise.all(Array.from({ length: maxConcurrency }, async () => {
        while (true) {
            const idx = currentIndex++;
            if (idx >= chunks.length)
                break;
            try {
                let audioQuery = await postAudioQuery(chunks[idx], speakerId);
                if (!audioQuery) {
                    results[idx] = Buffer.alloc(0);
                    continue;
                }
                audioQuery = adjustAudioQuery(audioQuery, guildId, userId);
                let buf = await postSynthesis(audioQuery, speakerId);
                // チャンクの先頭・末尾の無音を除去
                buf = trimSilence(buf);
                results[idx] = buf;
            }
            catch (e) {
                console.error(`チャンク ${idx} 合成失敗`, e);
                results[idx] = Buffer.alloc(0);
            }
        }
    }));
    const nonEmpty = results.filter(buf => buf.length > 100); // 100バイト未満は無音とみなす
    if (nonEmpty.length === 0)
        return;
    const fullBuffer = Buffer.concat(nonEmpty);
    // 1回だけFFmpeg変換して再生
    const player = getOrCreateAudioPlayer(guildId);
    const vc = exports.voiceClients[guildId];
    if (vc)
        vc.subscribe(player);
    const { resource, ffmpeg } = await createFFmpegAudioSource(fullBuffer);
    player.play(resource);
    try {
        await (0, voice_1.entersState)(player, voice_1.AudioPlayerStatus.Playing, 5000);
        await (0, voice_1.entersState)(player, voice_1.AudioPlayerStatus.Idle, 60000);
    }
    catch (err) {
        console.error("再生中にエラー:", err);
    }
    finally {
        await ffmpegPool.release(ffmpeg).catch(() => { });
    }
}
// ギルドごとにVoiceConnectionを確保・再利用する関数
function ensureVoiceConnection(guildId, voiceChannel) {
    let connection = exports.voiceClients[guildId];
    if (!connection || connection.state.status === voice_1.VoiceConnectionStatus.Destroyed) {
        connection = (0, voice_1.joinVoiceChannel)({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });
        // ここでリスナー上限を増やす（デフォルト10→50）
        connection.setMaxListeners(50);
        exports.voiceClients[guildId] = connection;
    }
    return connection;
}
async function speakVoiceImpl(text, speaker, guildId, userId) {
    const vc = exports.voiceClients[guildId];
    if (!vc) {
        console.warn(`VoiceConnection が存在しません`);
        return Promise.resolve();
    }
    try {
        await (0, voice_1.entersState)(vc, voice_1.VoiceConnectionStatus.Ready, 5000);
    }
    catch {
        console.warn(`VoiceConnection Ready になりませんでした`);
        return;
    }
    await speakBufferedChunks(text, speaker, guildId, 2, userId);
    return;
}
/**
 * メッセージ読み上げ: ユーザーごとの話者設定を参照
 */
function speakVoice(text, userId, guildId) {
    const speaker = exports.currentSpeaker[String(userId)] ?? exports.DEFAULT_SPEAKER_ID;
    const queue = getQueueForUser(guildId);
    return queue.add(() => speakVoiceImpl(text, speaker, guildId, String(userId)));
}
/**
 * アナウンス用: 必ずデフォルト話者で再生
 */
function speakAnnounce(text, guildId) {
    const queue = getQueueForUser(guildId);
    return queue.add(() => speakVoiceImpl(text, exports.DEFAULT_SPEAKER_ID, guildId));
}
// ユーザー／ギルドごとのキュー管理
const userQueues = new Map();
function getQueueForUser(userId) {
    const plan = (0, subscription_1.getSubscription)(userId); // SubscriptionType を取得
    const concurrency = plan === subscription_1.SubscriptionType.PREMIUM ? 4 :
        plan === subscription_1.SubscriptionType.PRO ? 2 : 1;
    if (!userQueues.has(userId)) {
        userQueues.set(userId, new p_queue_1.default({ concurrency }));
    }
    // 動的に並列数を更新
    const queue = userQueues.get(userId);
    queue.concurrency = concurrency;
    return queue;
}
// AudioPlayerごとのサブスクライブ状態を管理するWeakMap
const playerSubscribedMap = new WeakMap();
// AudioPlayer/VoiceConnectionのリスナー上限を明示的に増やす
function getPlayer(guildId) {
    if (!exports.players[guildId]) {
        exports.players[guildId] = (0, voice_1.createAudioPlayer)({
            behaviors: {
                noSubscriber: voice_1.NoSubscriberBehavior.Play
            }
        });
        // イベントリスナー上限を増やす（デフォルト10→50）
        exports.players[guildId].setMaxListeners(50);
    }
    return exports.players[guildId];
}
function uuidv4() {
    // Node.js の randomUUID が利用可能な場合はそれを使用
    if (typeof crypto_1.randomUUID === "function") {
        return (0, crypto_1.randomUUID)();
    }
    // 利用できない場合は簡易実装
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
// ボイスクライアント接続チェックを行う関数を追加
function isVoiceClientConnected(guildId) {
    if (!exports.voiceClients[guildId]) {
        return false;
    }
    // VoiceConnectionStatusがReadyであるか確認
    return exports.voiceClients[guildId].state.status === voice_1.VoiceConnectionStatus.Ready;
}
let autoJoinChannelsData = {};
// 初期化時に既存のデータを読み込む
exports.autoJoinChannels = loadAutoJoinChannels();
function loadAutoJoinChannels() {
    try {
        if (fs.existsSync(exports.AUTO_JOIN_FILE)) {
            console.log(`自動参加チャンネル設定を読み込みます: ${exports.AUTO_JOIN_FILE}`);
            const data = fs.readFileSync(exports.AUTO_JOIN_FILE, "utf-8");
            const loadedData = JSON.parse(data);
            // 読み込んだデータが有効なオブジェクトであることを確認
            if (loadedData && typeof loadedData === 'object') {
                // 既存のautoJoinChannelsにデータをマージ
                return loadedData;
            }
        }
    }
    catch (error) {
        console.error("自動参加チャンネル設定読み込みエラー:", error);
    }
    return {};
}
function saveAutoJoinChannels() {
    try {
        // 既存のデータを読み込む
        let existingData = {};
        if (fs.existsSync(exports.AUTO_JOIN_FILE)) {
            try {
                const data = fs.readFileSync(exports.AUTO_JOIN_FILE, "utf-8");
                existingData = JSON.parse(data);
            }
            catch (readError) {
                console.error(`既存の自動参加チャンネル設定読み込みエラー: ${readError}`);
                // 読み込みエラーの場合は空のオブジェクトで続行
                existingData = {};
            }
        }
        // autoJoinChannelsの内容を既存データとマージ
        const mergedData = { ...existingData, ...exports.autoJoinChannels };
        // マージしたデータを保存
        ensureDirectoryExists(exports.AUTO_JOIN_FILE);
        fs.writeFileSync(exports.AUTO_JOIN_FILE, JSON.stringify(mergedData, null, 4), "utf-8");
        console.log(`自動参加チャンネル設定を保存しました: ${exports.AUTO_JOIN_FILE}`);
        // グローバル変数も更新
        Object.assign(exports.autoJoinChannels, mergedData);
    }
    catch (error) {
        console.error(`自動参加チャンネル設定保存エラー (${exports.AUTO_JOIN_FILE}):`, error);
    }
}
// 新規：特定のギルドの自動参加設定を更新/追加する関数
function updateAutoJoinChannel(guildId, voiceChannelId, textChannelId) {
    // 既存の設定を保持したまま特定のギルドの設定だけを更新
    exports.autoJoinChannels[guildId] = { voiceChannelId, textChannelId };
    saveAutoJoinChannels();
}
// 新規：特定のギルドの自動参加設定を削除する関数
function removeAutoJoinChannel(guildId) {
    if (exports.autoJoinChannels[guildId]) {
        delete exports.autoJoinChannels[guildId];
        saveAutoJoinChannels();
        return true;
    }
    return false;
}
// ファイル書き込み時にパスの存在チェックと親ディレクトリ作成を行う関数
function ensureDirectoryExists(filePath) {
    const dirname = path_1.default.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}
function getSpeakerOptions() {
    try {
        if (!Array.isArray(exports.speakers)) {
            console.error("スピーカー情報が配列ではありません");
            return DEFAULT_SPEAKERS[0].styles.map(style => ({
                label: `${DEFAULT_SPEAKERS[0].name} - ${style.name}`,
                value: `${DEFAULT_SPEAKERS[0].name}-${style.name}-${style.id}`
            }));
        }
        const options = [];
        for (const speaker of exports.speakers) {
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
    }
    catch (error) {
        console.error("スピーカーオプション生成エラー:", error);
        return [{
                label: "Anneli - ノーマル",
                value: "Anneli-ノーマル-888753760"
            }];
    }
}
// 新規：join_channels.json のパス設定を process.cwd() ベースに変更
let joinChannels = {};
joinChannels = loadJoinChannels();
// 新規：join_channels.json を読み込む関数  (ファイルが存在しない場合は空のオブジェクトを返す)
function loadJoinChannels() {
    try {
        if (fs.existsSync(exports.JOIN_CHANNELS_FILE)) {
            console.log(`参加チャンネル設定を読み込みます: ${exports.JOIN_CHANNELS_FILE}`);
            const data = fs.readFileSync(exports.JOIN_CHANNELS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error("参加チャンネル設定読み込みエラー:", error);
    }
    return {};
}
// 新規：取得したチャネル情報を保存する関数
function updateJoinChannelsConfig(guildId, voiceChannelId, textChannelId) {
    let joinChannels = {};
    try {
        if (fs.existsSync(exports.JOIN_CHANNELS_FILE)) {
            const data = fs.readFileSync(exports.JOIN_CHANNELS_FILE, 'utf-8');
            joinChannels = JSON.parse(data);
        }
    }
    catch (error) {
        console.error(`参加チャンネル設定読み込みエラー (${exports.JOIN_CHANNELS_FILE}):`, error);
        joinChannels = {};
    }
    joinChannels[guildId] = { voiceChannelId, textChannelId };
    try {
        ensureDirectoryExists(exports.JOIN_CHANNELS_FILE);
        fs.writeFileSync(exports.JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
        console.log(`参加チャンネル設定を保存しました: ${exports.JOIN_CHANNELS_FILE}`);
    }
    catch (error) {
        console.error(`参加チャンネル設定保存エラー (${exports.JOIN_CHANNELS_FILE}):`, error);
    }
}
// 新規：join_channels.json を保存する関数
function saveJoinChannels(joinChannels) {
    try {
        ensureDirectoryExists(exports.JOIN_CHANNELS_FILE);
        fs.writeFileSync(exports.JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    }
    catch (error) {
        console.error("参加チャンネル設定保存エラー:", error);
    }
}
// 新規：チャンネル情報を削除する関数
function deleteJoinChannelsConfig(guildId) {
    let joinChannels = {};
    try {
        if (fs.existsSync(exports.JOIN_CHANNELS_FILE)) {
            const data = fs.readFileSync(exports.JOIN_CHANNELS_FILE, 'utf-8');
            joinChannels = JSON.parse(data);
        }
    }
    catch (error) {
        console.error("参加チャンネル設定読み込みエラー:", error);
        joinChannels = {};
    }
    delete joinChannels[guildId];
    try {
        ensureDirectoryExists(exports.JOIN_CHANNELS_FILE);
        fs.writeFileSync(exports.JOIN_CHANNELS_FILE, JSON.stringify(joinChannels, null, 4), 'utf-8');
    }
    catch (error) {
        console.error(`参加チャンネル設定保存エラー (${exports.JOIN_CHANNELS_FILE}):`, error);
    }
}
// メッセージ送信先を決定する関数
function determineMessageTargetChannel(guildId, defaultChannelId) {
    // 保存されたテキストチャンネルIDを優先
    const savedTextChannelId = (0, voiceStateManager_1.getTextChannelForGuild)(guildId);
    return savedTextChannelId || defaultChannelId;
}
/**
 * TTSエンジンの健全性をチェックする
 * @returns TTSエンジンが正常に動作している場合はtrue、そうでない場合はfalse
 */
function checkTTSHealth() {
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
    }
    catch (error) {
        console.error('TTSエンジン健全性チェックエラー:', error);
        return false;
    }
}
/**
 * 最後の発話時刻を取得する
 */
let _lastSpeechTime = Date.now();
function getLastSpeechTime() {
    return _lastSpeechTime;
}
/**
 * 発話が行われた際に最終発話時刻を更新する
 */
function updateLastSpeechTime() {
    _lastSpeechTime = Date.now();
}
/**
 * ボイスチャンネルに接続しているかチェックする
 */
function isConnectedToVoiceChannels() {
    // voiceClientsオブジェクトの中に有効な接続があるかをチェック
    for (const guildId in exports.voiceClients) {
        if (exports.voiceClients[guildId] && exports.voiceClients[guildId].state.status === voice_1.VoiceConnectionStatus.Ready) {
            return true;
        }
    }
    return false;
}
/**
 * TTSエンジンをリセットする
 */
function resetTTSEngine() {
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
    }
    catch (error) {
        console.error('TTSエンジンのリセット中にエラーが発生しました:', error);
        throw error;
    }
}
// 読み上げ優先度の確認関数
function getTTSPriority(guildId) {
    const subscriptionType = (0, subscription_1.getSubscription)(guildId);
    // 優先度が高いほど、キュー内で先に処理される
    return subscriptionType === subscription_1.SubscriptionType.PREMIUM ? 2 :
        subscriptionType === subscription_1.SubscriptionType.PRO ? 1 : 0;
}
// 音声品質の確認関数
function getVoiceQuality(guildId) {
    return (0, subscription_1.checkSubscriptionFeature)(guildId, 'highQualityVoice') ? 'high' : 'standard';
}
// 全ての声優を取得する関数
function getAllVoices() {
    const voices = [];
    // speakersデータから声優情報を抽出
    for (const speaker of exports.speakers) {
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
function getAvailableVoices(guildId) {
    const subscriptionType = (0, subscription_1.getSubscription)(guildId);
    const allVoices = getAllVoices();
    // 基本的な声優リスト
    const freeVoices = allVoices.filter(voice => voice.tier === 'free');
    // Proプラン用の声優
    if (subscriptionType === subscription_1.SubscriptionType.PRO) {
        const proVoices = allVoices.filter(voice => voice.tier === 'free' || voice.tier === 'pro');
        return proVoices
            .slice(0, (0, subscription_1.getSubscriptionLimit)(guildId, 'maxVoices'))
            .map(voice => voice.name);
    }
    // Premiumプラン用の声優
    if (subscriptionType === subscription_1.SubscriptionType.PREMIUM) {
        return allVoices
            .slice(0, (0, subscription_1.getSubscriptionLimit)(guildId, 'maxVoices'))
            .map(voice => voice.name);
    }
    // 無料プラン
    return freeVoices
        .slice(0, (0, subscription_1.getSubscriptionLimit)(guildId, 'maxVoices'))
        .map(voice => voice.name);
}
// メッセージ長の確認
function validateMessageLength(guildId, message) {
    const maxLength = (0, subscription_1.getSubscriptionLimit)(guildId, 'maxMessageLength');
    return message.length <= maxLength;
}
// 既存のTTS処理関数を拡張
function processMessage(guildId, message, options) {
    // メッセージ長チェック
    if (!validateMessageLength(guildId, message)) {
        throw new Error(`メッセージが長すぎます。現在のプランでは${(0, subscription_1.getSubscriptionLimit)(guildId, 'maxMessageLength')}文字までです。`);
    }
    // 音声品質の設定
    options.quality = getVoiceQuality(guildId);
    // 優先度の設定
    options.priority = getTTSPriority(guildId);
    // Premiumユーザー向けの特殊機能
    if ((0, subscription_1.checkSubscriptionFeature)(guildId, 'textTransformationEffects')) {
        message = applyTextTransformations(message, options);
    }
    // 既存の処理を続ける
    // ...
}
// テキスト変換エフェクト (Premiumのみ)
function applyTextTransformations(message, options) {
    // 実装例: 特殊なマークアップを処理
    // 例: *強調*、#タグ、@メンション など
    // この関数ではテキストの変換処理を行う
    return message; // 変換後のテキストを返す
}
// ギルドごとに AudioPlayer を保持
const audioPlayers = new Map();
/**
 * 指定ギルドの既存プレイヤーを停止破棄し、
 * 常に新規プレイヤーを生成して返す
 */
function getOrCreateAudioPlayer(guildId) {
    const prev = audioPlayers.get(guildId);
    if (prev) {
        prev.stop();
        audioPlayers.delete(guildId);
    }
    const player = (0, voice_1.createAudioPlayer)();
    audioPlayers.set(guildId, player);
    return player;
}
/**
 * 指定ギルドの Connection／Player を完全破棄
 */
function cleanupAudioResources(guildId) {
    const conn = (0, voice_1.getVoiceConnection)(guildId);
    if (conn)
        conn.destroy();
    const player = audioPlayers.get(guildId);
    if (player) {
        player.stop();
        audioPlayers.delete(guildId);
    }
}
// デフォルト話者ID（Anneli ノーマル）
exports.DEFAULT_SPEAKER_ID = 888753760;
// 16bit PCM, 1ch, silence = 0x0000, threshold: 8サンプル連続で無音ならカット
function trimSilence(buffer, threshold = 8) {
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
//# sourceMappingURL=TTS-Engine.js.map