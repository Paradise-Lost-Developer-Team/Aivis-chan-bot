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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceStampManager = void 0;
exports.setupVoiceStampEvents = setupVoiceStampEvents;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const voice_1 = require("@discordjs/voice");
const sentry_1 = require("./sentry");
// データ保存場所の設定
const STAMP_DIRECTORY = path.join(__dirname, '../data/voice_stamps');
const STAMP_DATA_FILE = path.join(__dirname, '../data/voice_stamps.json');
// ディレクトリがなければ作成
if (!fs.existsSync(STAMP_DIRECTORY)) {
    fs.mkdirSync(STAMP_DIRECTORY, { recursive: true });
}
/**
 * ボイススタンプ管理クラス
 * ボイススタンプの保存、取得、再生などを管理する
 */
class VoiceStampManager {
    constructor(client) {
        this.stamps = new Map();
        this.activeConnections = new Map();
        this.client = client;
        this.loadStamps();
    }
    /**
     * シングルトンインスタンスを取得
     */
    static getInstance(client) {
        if (!VoiceStampManager.instance) {
            VoiceStampManager.instance = new VoiceStampManager(client);
        }
        return VoiceStampManager.instance;
    }
    /**
     * 保存されているボイススタンプを読み込む
     */
    loadStamps() {
        try {
            if (fs.existsSync(STAMP_DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(STAMP_DATA_FILE, 'utf-8'));
                for (const stamp of data) {
                    this.stamps.set(stamp.id, {
                        ...stamp,
                        createdAt: new Date(stamp.createdAt)
                    });
                }
                console.log(`${this.stamps.size} ボイススタンプを読み込みました`);
            }
        }
        catch (error) {
            console.error('ボイススタンプの読み込みに失敗しました:', error);
            (0, sentry_1.captureException)(error, 'voiceStampLoad');
        }
    }
    /**
     * ボイススタンプデータを保存
     */
    saveStamps() {
        try {
            const data = Array.from(this.stamps.values());
            fs.writeFileSync(STAMP_DATA_FILE, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('ボイススタンプの保存に失敗しました:', error);
            (0, sentry_1.captureException)(error, 'voiceStampSave');
        }
    }
    /**
     * 新しいボイススタンプを作成
     */
    async createStamp(options) {
        try {
            const id = `stamp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const filePath = path.join(STAMP_DIRECTORY, `${id}.mp3`);
            // ファイルに保存
            fs.writeFileSync(filePath, options.audioBuffer);
            // メタデータの取得（実際の実装ではオーディオファイルのメタデータから取得する）
            const duration = 5; // 仮の値、実際には計算する必要がある
            const stamp = {
                id,
                name: options.name,
                userId: options.userId,
                guildId: options.guildId,
                filePath,
                createdAt: new Date(),
                useCount: 0,
                isGlobal: options.isGlobal || false,
                duration,
                category: options.category
            };
            this.stamps.set(id, stamp);
            this.saveStamps();
            return stamp;
        }
        catch (error) {
            console.error('ボイススタンプの作成に失敗しました:', error);
            (0, sentry_1.captureException)(error, 'voiceStampCreate');
            return null;
        }
    }
    /**
     * ボイススタンプを再生
     */
    async playStamp(stampId, voiceChannel, member) {
        const stamp = this.stamps.get(stampId);
        if (!stamp || !fs.existsSync(stamp.filePath)) {
            return false;
        }
        try {
            // まずVoiceConnectionを取得する
            let connection = (0, voice_1.getVoiceConnection)(voiceChannel.guild.id);
            // 接続がない場合は自分のコネクションをチェック
            if (!connection) {
                connection = this.activeConnections.get(voiceChannel.guild.id);
            }
            // それでも接続がない場合は新規接続
            if (!connection) {
                connection = (0, voice_1.joinVoiceChannel)({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                });
                this.activeConnections.set(voiceChannel.guild.id, connection);
            }
            // オーディオリソースとプレイヤーの作成
            const resource = (0, voice_1.createAudioResource)(stamp.filePath);
            const player = (0, voice_1.createAudioPlayer)();
            // ボイススタンプの使用回数を増加
            stamp.useCount++;
            this.saveStamps();
            // プレイヤーをボイスコネクションに接続して再生
            connection.subscribe(player);
            player.play(resource);
            // 完了時のイベント設定
            return new Promise((resolve) => {
                player.on(voice_1.AudioPlayerStatus.Idle, () => {
                    resolve(true);
                });
                player.on('error', (error) => {
                    console.error('ボイススタンプ再生エラー:', error);
                    (0, sentry_1.captureException)(error, 'voiceStampPlayback');
                    resolve(false);
                });
            });
        }
        catch (error) {
            console.error('ボイススタンプの再生に失敗しました:', error);
            (0, sentry_1.captureException)(error, 'voiceStampPlay');
            return false;
        }
    }
    /**
     * ボイススタンプを削除
     */
    deleteStamp(stampId, userId) {
        const stamp = this.stamps.get(stampId);
        if (!stamp || (stamp.userId !== userId && !stamp.isGlobal)) {
            return false;
        }
        try {
            // ファイルが存在する場合は削除
            if (fs.existsSync(stamp.filePath)) {
                fs.unlinkSync(stamp.filePath);
            }
            // マップからも削除
            this.stamps.delete(stampId);
            this.saveStamps();
            return true;
        }
        catch (error) {
            console.error('ボイススタンプの削除に失敗しました:', error);
            (0, sentry_1.captureException)(error, 'voiceStampDelete');
            return false;
        }
    }
    /**
     * ボイススタンプの一覧を取得
     */
    getStamps(guildId, includeGlobal = true) {
        const result = [];
        for (const stamp of this.stamps.values()) {
            if (stamp.guildId === guildId || (includeGlobal && stamp.isGlobal)) {
                result.push(stamp);
            }
        }
        return result;
    }
    /**
     * 特定のユーザーが所有するボイススタンプの一覧を取得
     */
    getUserStamps(userId) {
        const result = [];
        for (const stamp of this.stamps.values()) {
            if (stamp.userId === userId) {
                result.push(stamp);
            }
        }
        return result;
    }
    /**
     * ボイススタンプ情報の更新
     */
    updateStamp(stampId, userId, updates) {
        const stamp = this.stamps.get(stampId);
        if (!stamp || (stamp.userId !== userId && !stamp.isGlobal)) {
            return false;
        }
        try {
            // 更新可能なフィールドのみを更新
            if (updates.name)
                stamp.name = updates.name;
            if (updates.category)
                stamp.category = updates.category;
            if (typeof updates.isGlobal === 'boolean')
                stamp.isGlobal = updates.isGlobal;
            this.stamps.set(stampId, stamp);
            this.saveStamps();
            return true;
        }
        catch (error) {
            console.error('ボイススタンプの更新に失敗しました:', error);
            (0, sentry_1.captureException)(error, 'voiceStampUpdate');
            return false;
        }
    }
}
exports.VoiceStampManager = VoiceStampManager;
// ボイススタンプ関連イベントを設定する関数
function setupVoiceStampEvents(client) {
    const stampManager = VoiceStampManager.getInstance(client);
    // メッセージイベントなどでボイススタンプ再生機能を追加できる
    // 例: !stamp <名前> のようなコマンドでボイススタンプを再生
    client.on('messageCreate', async (message) => {
        if (message.author.bot)
            return;
        // ここでボイススタンプのコマンドを処理
        // 実際の実装ではスラッシュコマンドを使用することが推奨
    });
}
//# sourceMappingURL=voiceStamp.js.map