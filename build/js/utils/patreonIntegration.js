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
exports.getPatreonAuthUrl = getPatreonAuthUrl;
exports.getPatreonTokens = getPatreonTokens;
exports.storePatreonUser = storePatreonUser;
exports.getUserTier = getUserTier;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
// 設定ファイルの読み込み
const CONFIG_PATH = path.join(__dirname, '../data/config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const { PATREON } = CONFIG;
// Patreonの認証情報
const CLIENT_ID = PATREON.CLIENT_ID;
const CLIENT_SECRET = PATREON.CLIENT_SECRET;
const REDIRECT_URI = PATREON.REDIRECT_URI;
// データディレクトリとユーザーデータファイルのパスを設定
const DATA_DIR = path.join(__dirname, '../data');
const PATREON_USERS_PATH = path.join(DATA_DIR, 'patreon-users.json');
// ユーザーデータ操作
let patreonUsers = {};
// データディレクトリの存在確認と作成
function ensureDataDirectoryExists() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            console.log(`データディレクトリが存在しません。作成します: ${DATA_DIR}`);
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }
    catch (error) {
        console.error('データディレクトリの作成に失敗しました:', error);
        throw new Error(`データディレクトリの作成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// 初期化時にユーザーデータをロード
function loadPatreonUsers() {
    try {
        // まずデータディレクトリの存在を確認
        ensureDataDirectoryExists();
        if (fs.existsSync(PATREON_USERS_PATH)) {
            patreonUsers = JSON.parse(fs.readFileSync(PATREON_USERS_PATH, 'utf8'));
            console.log('Patreonユーザーデータを読み込みました');
        }
        else {
            // ファイルが存在しない場合は作成
            fs.writeFileSync(PATREON_USERS_PATH, JSON.stringify({}), 'utf8');
            console.log('Patreonユーザーデータファイルを作成しました');
        }
    }
    catch (error) {
        console.error('Patreonユーザーデータの読み込みエラー:', error);
        // エラーが発生しても、空のオブジェクトで初期化
        patreonUsers = {};
    }
}
// ユーザーデータを保存
function savePatreonUsers() {
    try {
        // 保存前にディレクトリを確認
        ensureDataDirectoryExists();
        fs.writeFileSync(PATREON_USERS_PATH, JSON.stringify(patreonUsers, null, 2), 'utf8');
    }
    catch (error) {
        console.error('Patreonユーザーデータの保存エラー:', error);
    }
}
// Patreon認証用のURLを生成
function getPatreonAuthUrl(discordId) {
    const state = Buffer.from(JSON.stringify({ discordId })).toString('base64');
    return `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=identity%20identity.memberships`;
}
// アクセストークンを取得
async function getPatreonTokens(code) {
    try {
        const response = await axios_1.default.post('https://www.patreon.com/api/oauth2/token', {
            code,
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI
        });
        return response.data;
    }
    catch (error) {
        console.error('Patreonトークン取得エラー:', error);
        throw error;
    }
}
// ユーザー情報を保存
function storePatreonUser(discordId, patreonData) {
    patreonUsers[discordId] = {
        discordId,
        patreonId: patreonData.patreonId,
        accessToken: patreonData.access_token,
        refreshToken: patreonData.refresh_token,
        expiresAt: Date.now() + patreonData.expires_in * 1000,
        tier: patreonData.tier || 'free'
    };
    savePatreonUsers();
}
// ユーザーのティア情報を取得
async function getUserTier(discordId) {
    const user = patreonUsers[discordId];
    if (!user)
        return 'free';
    // トークンが期限切れならリフレッシュを試みる
    if (user.expiresAt < Date.now()) {
        try {
            await refreshTokens(discordId);
        }
        catch (error) {
            console.error(`ユーザー ${discordId} のトークンリフレッシュエラー:`, error);
            return 'free';
        }
    }
    return user.tier;
}
// トークンのリフレッシュ
async function refreshTokens(discordId) {
    try {
        const user = patreonUsers[discordId];
        if (!user)
            throw new Error('User not found');
        const response = await axios_1.default.post('https://www.patreon.com/api/oauth2/token', {
            grant_type: 'refresh_token',
            refresh_token: user.refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        });
        user.accessToken = response.data.access_token;
        user.refreshToken = response.data.refresh_token;
        user.expiresAt = Date.now() + response.data.expires_in * 1000;
        savePatreonUsers();
    }
    catch (error) {
        console.error('トークンリフレッシュエラー:', error);
        throw error;
    }
}
// 初期化
loadPatreonUsers();
exports.default = {
    getPatreonAuthUrl,
    getPatreonTokens,
    storePatreonUser,
    getUserTier
};
//# sourceMappingURL=patreonIntegration.js.map