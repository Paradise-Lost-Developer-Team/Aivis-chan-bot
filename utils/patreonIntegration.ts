import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// 設定ファイルの読み込み
const CONFIG_PATH = path.join(__dirname, '../data/config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const { PATREON } = CONFIG;

// Patreonの認証情報（環境変数優先）
const CLIENT_ID = process.env.PATREON_CLIENT_ID || PATREON.CLIENT_ID;
const CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET || PATREON.CLIENT_SECRET;
const REDIRECT_URI = process.env.PATREON_REDIRECT_URI || PATREON.REDIRECT_URI;
// 中央サーバ（web）のURL（フォールバック。デプロイ時は BASE_URL を設定してください）
const FALLBACK_SERVER = process.env.BASE_URL || PATREON.FALLBACK_SERVER || 'http://localhost:3001';

// ログプレフィックス
const LOG_PREFIX = '[patreon]';

// データディレクトリとユーザーデータファイルのパスを設定
const DATA_DIR = path.join(__dirname, '../data');
const PATREON_USERS_PATH = path.join(DATA_DIR, 'patreon-users.json');

// ユーザータイプの定義
interface PatreonUser {
  discordId: string;
  patreonId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tier: string;
}

// ユーザーデータ操作
let patreonUsers: Record<string, PatreonUser> = {};

// データディレクトリの存在確認と作成
function ensureDataDirectoryExists() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      console.log(`データディレクトリが存在しません。作成します: ${DATA_DIR}`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
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
    } else {
      // ファイルが存在しない場合は作成
      fs.writeFileSync(PATREON_USERS_PATH, JSON.stringify({}), 'utf8');
      console.log('Patreonユーザーデータファイルを作成しました');
    }
  } catch (error) {
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
  } catch (error) {
    console.error('Patreonユーザーデータの保存エラー:', error);
  }
}

// Patreon認証用のURLを生成
export function getPatreonAuthUrl(discordId: string): string {
  const state = Buffer.from(JSON.stringify({ discordId })).toString('base64');
  return `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=identity%20identity.memberships`;
}

// アクセストークンを取得
export async function getPatreonTokens(code: string): Promise<any> {
  try {
    const response = await axios.post('https://www.patreon.com/api/oauth2/token', {
      code,
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    });
    
    return response.data;
  } catch (error) {
    console.error('Patreonトークン取得エラー:', error);
    throw error;
  }
}

// ユーザー情報を保存
export function storePatreonUser(discordId: string, patreonData: any): void {
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
export async function getUserTier(discordId: string): Promise<string> {
  console.log(`${LOG_PREFIX} getUserTier start for ${discordId}`);
  let user = patreonUsers[discordId];

  // ローカルに情報がなければ中央サーバを問い合わせて同期を試みる
  if (!user) {
    console.log(`${LOG_PREFIX} no local user for ${discordId}, attempting remote fetch from ${FALLBACK_SERVER}`);
    try {
      const remote = await fetchRemoteLink(discordId);
      if (remote) {
        console.log(`${LOG_PREFIX} remote link found for ${discordId}`);
        // remote contains { discordId, patreonId, tokenData }
        const tokenData = remote.tokenData || {};
        user = {
          discordId,
          patreonId: remote.patreonId || '',
          accessToken: tokenData.access_token || '',
          refreshToken: tokenData.refresh_token || '',
          expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : 0,
          tier: remote.tier || 'free'
        } as PatreonUser;
        patreonUsers[discordId] = user;
        savePatreonUsers();
      } else {
        console.log(`${LOG_PREFIX} no remote link for ${discordId}`);
      }
    } catch (err) {
      const e: any = err;
      console.warn(`${LOG_PREFIX} Failed to fetch remote patreon link:`, e?.message || e);
    }
  }

  if (!user) {
    console.log(`${LOG_PREFIX} getUserTier result for ${discordId}: free (no user)`);
    return 'free';
  }

  // トークンが期限切れならリフレッシュを試みる
  if (user.expiresAt < Date.now()) {
    try {
      await refreshTokens(discordId);
    } catch (error) {
      console.error(`ユーザー ${discordId} のトークンリフレッシュエラー:`, error);
      return 'free';
    }
  }

  // トークンを使ってPatreon APIからメンバーシップ情報を取得し、tier を更新する
  try {
    const fetchedTier = await fetchPatreonMemberships(user.accessToken);
    if (fetchedTier && fetchedTier !== user.tier) {
      user.tier = fetchedTier;
      savePatreonUsers();
    }
  } catch (err) {
    const e: any = err;
    console.warn('Failed to fetch memberships from Patreon:', e?.message || e);
  }

  console.log(`${LOG_PREFIX} getUserTier result for ${discordId}: ${user.tier}`);
  return user.tier;
}

// Patreon API レスポンスの型定義
interface PatreonTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// トークンのリフレッシュ
async function refreshTokens(discordId: string): Promise<void> {
  try {
    const user = patreonUsers[discordId];
    if (!user) throw new Error('User not found');
  console.log(`${LOG_PREFIX} refreshing tokens for ${discordId}`);
    const response = await axios.post<PatreonTokenResponse>('https://www.patreon.com/api/oauth2/token', {
      grant_type: 'refresh_token',
      refresh_token: user.refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });
    
    user.accessToken = response.data.access_token;
    user.refreshToken = response.data.refresh_token;
    user.expiresAt = Date.now() + response.data.expires_in * 1000;
    
    savePatreonUsers();
  console.log(`${LOG_PREFIX} token refresh successful for ${discordId}, expiresAt=${user.expiresAt}`);
  } catch (error) {
    console.error('トークンリフレッシュエラー:', error);
    throw error;
  }
}

// 中央サーバに保存されたリンク情報を取得するフォールバック
async function fetchRemoteLink(discordId: string): Promise<any | null> {
  try {
    const url = `${FALLBACK_SERVER.replace(/\/$/, '')}/api/patreon/link/${encodeURIComponent(discordId)}`;
    console.log(`${LOG_PREFIX} fetching remote link from ${url}`);
    const r = await axios.get(url, { timeout: 5000 });
    console.log(`${LOG_PREFIX} remote link response status=${r.status}`);
    if (r && r.status === 200 && r.data) {
      return r.data;
    }
    return null;
  } catch (err) {
    const e: any = err;
    if (e && e.response && e.response.status === 404) return null;
    throw e;
  }
}

// Patreon API から memberships を取得して簡易的に tier を判定する
async function fetchPatreonMemberships(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  try {
  console.log(`${LOG_PREFIX} fetching Patreon memberships (masked token present=${!!accessToken})`);
  const me = await axios.get('https://www.patreon.com/api/oauth2/v2/identity?include=memberships', { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 });
  console.log(`${LOG_PREFIX} Patreon memberships response status=${me.status}`);
    const included = (me.data && (me.data as any).included) || [];
    for (const item of included) {
      const attrs = (item && (item as any).attributes) || {};
      if (attrs.patron_status === 'active_patron') return 'pro';
      if (attrs.currently_entitled_amount_cents && attrs.currently_entitled_amount_cents > 0) return 'pro';
    }
    return 'free';
  } catch (err) {
    const e: any = err;
    // 401ならトークン切れの可能性がある
    if (e && e.response && e.response.status === 401) throw e;
    return null;
  }
}

// 初期化
loadPatreonUsers();

export default {
  getPatreonAuthUrl,
  getPatreonTokens,
  storePatreonUser,
  getUserTier
};
