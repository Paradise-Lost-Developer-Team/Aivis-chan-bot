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
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('redirect_uri', REDIRECT_URI);

    const response = await axios.post('https://www.patreon.com/api/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data;
  } catch (error) {
    console.error('Patreonトークン取得エラー:', error);
    throw error;
  }
}

// ユーザー情報を保存
export function storePatreonUser(discordId: string, tokenData: any, patreonId?: string): void {
  const expires = tokenData?.expires_in ? Date.now() + tokenData.expires_in * 1000 : 0;
  patreonUsers[discordId] = {
    discordId,
    patreonId: patreonId || tokenData?.patreonId || '',
    accessToken: tokenData?.access_token || '',
    refreshToken: tokenData?.refresh_token || '',
    expiresAt: expires,
    tier: 'free'
  } as PatreonUser;
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

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', user.refreshToken);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const response = await axios.post<PatreonTokenResponse>('https://www.patreon.com/api/oauth2/token', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
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
    // Request membership-related fields explicitly. Use fields[member] which matches the membership object type.
    const url = 'https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields[member]=patron_status,currently_entitled_amount_cents,pledge_relationship_start';
    const me = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 });
    console.log(`${LOG_PREFIX} Patreon memberships response status=${me.status}`);
    const included = (me.data && (me.data as any).included) || [];

    // Log included items to help debugging empty attributes (will be visible in pod logs)
    if (!included || included.length === 0) {
      console.log(`${LOG_PREFIX} no included membership objects returned by Patreon`);
    } else {
      for (const item of included) {
        try {
          const id = item && (item as any).id;
          const type = item && (item as any).type;
          const attrs = (item && (item as any).attributes) || {};
          console.log(`${LOG_PREFIX} included item id=${id} type=${type} attributes=${JSON.stringify(attrs)}`);
        } catch (e) {
          console.log(`${LOG_PREFIX} included item (could not stringify)`, e);
        }
      }
    }

    // Determine tier. Support 'premium' (> threshold cents) and 'pro'.
    const PREMIUM_THRESHOLD = parseInt(process.env.PATREON_PREMIUM_CENTS || '1000', 10); // default 1000 cents
    const GIFT_DEFAULT = (process.env.PATREON_GIFT_DEFAULT || 'pro').toLowerCase(); // 'pro' or 'premium'

    for (const item of included) {
      const attrs = (item && (item as any).attributes) || {};

      // Active patron always considered at least pro. Use amount to decide premium.
      if (attrs.patron_status === 'active_patron') {
        const amount = typeof attrs.currently_entitled_amount_cents === 'number' ? attrs.currently_entitled_amount_cents : 0;
        if (amount >= PREMIUM_THRESHOLD) {
          console.log(`${LOG_PREFIX} active_patron with amount=${amount} >= ${PREMIUM_THRESHOLD} -> premium`);
          return 'premium';
        }
        console.log(`${LOG_PREFIX} active_patron with amount=${amount} -> pro`);
        return 'pro';
      }

      // If current entitled amount is present and >0, use threshold to split pro/premium
      if (typeof attrs.currently_entitled_amount_cents === 'number' && attrs.currently_entitled_amount_cents > 0) {
        const amount = attrs.currently_entitled_amount_cents;
        if (amount >= PREMIUM_THRESHOLD) {
          console.log(`${LOG_PREFIX} currently_entitled_amount_cents=${amount} >= ${PREMIUM_THRESHOLD} -> premium`);
          return 'premium';
        }
        console.log(`${LOG_PREFIX} currently_entitled_amount_cents=${amount} -> pro`);
        return 'pro';
      }

      // Gifted membership: pledge_relationship_start exists but amount may be 0 or missing.
      if (attrs.pledge_relationship_start) {
        // Try to detect any gift-related amount-like fields
        const possibleAmount = typeof attrs.currently_entitled_amount_cents === 'number' ? attrs.currently_entitled_amount_cents : 0;
        if (possibleAmount > 0) {
          if (possibleAmount >= PREMIUM_THRESHOLD) {
            console.log(`${LOG_PREFIX} gift with amount=${possibleAmount} -> premium`);
            return 'premium';
          }
          console.log(`${LOG_PREFIX} gift with amount=${possibleAmount} -> pro`);
          return 'pro';
        }

        // No amount available. Fall back to configured default for gifts.
        if (GIFT_DEFAULT === 'premium') {
          console.log(`${LOG_PREFIX} gift detected (pledge_relationship_start) - using configured default -> premium`);
          return 'premium';
        }
        console.log(`${LOG_PREFIX} gift detected (pledge_relationship_start) - using configured default -> pro`);
        return 'pro';
      }
    }

    return 'free';
  } catch (err) {
    const e: any = err;
    // 401ならトークン切れの可能性があるため呼び出し元でリフレッシュ処理を試す
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
