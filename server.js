const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { google } = require('googleapis');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// Redis セッションストア設定
let redisStoreInstance = null;

// SESSION_STORE環境変数が'redis'の場合のみRedisストアを使用
if (process.env.SESSION_STORE === 'redis') {
  try {
    const RedisStore = require('connect-redis').default;
    const redis = require('redis');
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 60000,
        lazyConnect: true
      }
    });

    redisClient.on('error', (err) => {
      console.error('[REDIS] Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('[REDIS] Client Connected');
    });

    redisClient.on('ready', () => {
      console.log('[REDIS] Client Ready');
    });

    redisClient.connect().catch((err) => {
      console.error('[REDIS] Connection failed:', err);
    });

    redisStoreInstance = new RedisStore({
      client: redisClient,
      prefix: 'aivis:sess:',
      ttl: 24 * 60 * 60 // 24時間（秒単位）
    });
    console.log('[SESSION] Using Redis session store');
  } catch (err) {
    console.error('[SESSION] Failed to setup Redis store, falling back to memory store:', err.message);
  }
} else {
  console.log('[SESSION] Using memory store (not suitable for production)');
}

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// --- Diagnostics: log env summary and catch crashes early ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err && (err.stack || err.message || err));
  // give logs a moment to flush
  setTimeout(() => process.exit(1), 200);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  setTimeout(() => process.exit(1), 200);
});

console.log('[STARTUP] server env summary:', {
  PORT,
  HOST,
  BASE_URL: process.env.BASE_URL ? 'set' : 'unset',
  SESSION_STORE: process.env.SESSION_STORE || 'memory',
  REDIS_URL: process.env.REDIS_URL ? 'set' : 'unset',
  PATREON_REDIRECT_URI: process.env.PATREON_REDIRECT_URI ? 'set' : (process.env.BASE_URL ? 'derived-from-BASE_URL' : 'unset')
});

// --- Patreon defaults (moved before any route that may reference them; k8s: avoid localhost fallback) ---
const PATREON_CLIENT_ID = process.env.PATREON_CLIENT_ID || '';
const PATREON_CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET || '';
const PATREON_REDIRECT_URI = process.env.PATREON_REDIRECT_URI || (process.env.BASE_URL ? `${String(process.env.BASE_URL).replace(/\/$/, '')}/auth/patreon/callback` : 'https://aivis-chan-bot.com/auth/patreon/callback');
const PATREON_REDIRECT_PATH = process.env.PATREON_REDIRECT_PATH || '/auth/patreon/callback';
const PATREON_LINKS_FILE = process.env.PATREON_LINKS_FILE || path.join('/tmp', 'data', 'patreon_links.json');

console.log('[PATREON] Config:', {
  CLIENT_ID: PATREON_CLIENT_ID ? 'set' : 'NOT SET',
  CLIENT_SECRET: PATREON_CLIENT_SECRET ? 'set' : 'NOT SET',
  REDIRECT_URI: PATREON_REDIRECT_URI || 'NOT SET',
  REDIRECT_PATH: PATREON_REDIRECT_PATH
});

// Discord OAuth2設定（無料版とPro/Premium版）
// Ensure callbackURL includes versioned callback path to match Discord Developer Portal settings
const BASE = (process.env.BASE_URL || 'https://aivis-chan-bot.com').replace(/\/$/, '');
const DISCORD_CONFIG_FREE = {
  clientId: process.env.DISCORD_CLIENT_ID_FREE || process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_FREE || process.env.DISCORD_CLIENT_SECRET,
  // use explicit /auth/discord/callback/free by default
  redirectUri: process.env.DISCORD_REDIRECT_URI_FREE || process.env.DISCORD_REDIRECT_URI || `${BASE}/auth/discord/callback/free`,
  version: 'free'
};

const DISCORD_CONFIG_PRO = {
  clientId: process.env.DISCORD_CLIENT_ID_PRO,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_PRO,
  // use explicit /auth/discord/callback/pro by default
  redirectUri: process.env.DISCORD_REDIRECT_URI_PRO || process.env.DISCORD_REDIRECT_URI || `${BASE}/auth/discord/callback/pro`,
  version: 'pro'
};

// デフォルト設定（後方互換性のため）
const DISCORD_CLIENT_ID = DISCORD_CONFIG_FREE.clientId;
const DISCORD_CLIENT_SECRET = DISCORD_CONFIG_FREE.clientSecret;
const DISCORD_REDIRECT_URI = DISCORD_CONFIG_FREE.redirectUri;

// Passport設定（無料版） - 必須値がある場合のみ登録
if (DISCORD_CONFIG_FREE.clientId && DISCORD_CONFIG_FREE.clientSecret) {
  passport.use('discord-free', new DiscordStrategy({
      clientID: DISCORD_CONFIG_FREE.clientId,
      clientSecret: DISCORD_CONFIG_FREE.clientSecret,
      callbackURL: DISCORD_CONFIG_FREE.redirectUri,
      scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('[PASSPORT DEBUG] verify start', { 
          version: 'free', 
          accessTokenPresent: Boolean(accessToken), 
          refreshTokenPresent: Boolean(refreshToken),
          profileId: profile?.id 
        });
      } catch (e) {}
      
      // バージョン情報を追加
      profile.version = 'free';
      profile.accessToken = accessToken;
      
      // プロフィール情報を取得して補完
      try {
        const [userResp, guildsResp] = await Promise.all([
          axios.get('https://discord.com/api/users/@me', { 
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000 
          }),
          axios.get('https://discord.com/api/users/@me/guilds', { 
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000
          })
        ]);
        
        if (userResp.status === 200) {
          profile.avatarUrl = userResp.data.avatar 
            ? `https://cdn.discordapp.com/avatars/${userResp.data.id}/${userResp.data.avatar}.png` 
            : null;
          profile.nickname = userResp.data.username;
          profile.discriminator = userResp.data.discriminator;
          profile.email = userResp.data.email || null;
        }
        
        if (guildsResp.status === 200) {
          profile.guilds = guildsResp.data.map(guild => ({ 
            id: guild.id, 
            name: guild.name, 
            icon: guild.icon,
            iconUrl: guild.icon 
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` 
              : null,
            owner: guild.owner || false,
            permissions: guild.permissions || null
          }));
        }
        
        console.log('[PASSPORT DEBUG] Profile enriched for user:', profile.id, 
          'guilds:', profile.guilds?.length || 0);
      } catch (e) {
        console.warn('[passport][discord-free] failed to enrich profile:', e.message || e);
      }
      
      return done(null, profile, { accessToken });
  }));
}

// Passport設定（Pro/Premium版） - 必須値がある場合のみ登録
if (DISCORD_CONFIG_PRO.clientId && DISCORD_CONFIG_PRO.clientSecret) {
  passport.use('discord-pro', new DiscordStrategy({
      clientID: DISCORD_CONFIG_PRO.clientId,
      clientSecret: DISCORD_CONFIG_PRO.clientSecret,
      callbackURL: DISCORD_CONFIG_PRO.redirectUri,
      scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('[PASSPORT DEBUG] verify start', { 
          version: 'pro', 
          accessTokenPresent: Boolean(accessToken), 
          refreshTokenPresent: Boolean(refreshToken),
          profileId: profile?.id 
        });
      } catch (e) {}
      
      // バージョン情報を追加
      profile.version = 'pro';
      profile.accessToken = accessToken;
      
      // プロフィール情報を取得して補完
      try {
        const [userResp, guildsResp] = await Promise.all([
          axios.get('https://discord.com/api/users/@me', { 
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000
          }),
          axios.get('https://discord.com/api/users/@me/guilds', { 
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 5000
          })
        ]);
        
        if (userResp.status === 200) {
          profile.avatarUrl = userResp.data.avatar 
            ? `https://cdn.discordapp.com/avatars/${userResp.data.id}/${userResp.data.avatar}.png` 
            : null;
          profile.nickname = userResp.data.username;
          profile.discriminator = userResp.data.discriminator;
          profile.email = userResp.data.email || null;
        }
        
        if (guildsResp.status === 200) {
          profile.guilds = guildsResp.data.map(guild => ({ 
            id: guild.id, 
            name: guild.name, 
            icon: guild.icon,
            iconUrl: guild.icon 
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` 
              : null,
            owner: guild.owner || false,
            permissions: guild.permissions || null
          }));
        }
        
        console.log('[PASSPORT DEBUG] Profile enriched for user:', profile.id, 
          'guilds:', profile.guilds?.length || 0);
      } catch (e) {
        console.warn('[passport][discord-pro] failed to enrich profile:', e.message || e);
      }
      
      return done(null, profile, { accessToken });
  }));
}

// 後方互換性のためのデフォルト設定 - 必須値がある場合のみ登録
if (DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
      clientID: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      callbackURL: DISCORD_REDIRECT_URI,
      scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
      try {
          // Discord APIからユーザー情報を取得
          const userResponse = await axios.get('https://discord.com/api/users/@me', {
              headers: {
                  Authorization: `Bearer ${accessToken}`
              }
          });

          if (userResponse.status !== 200) {
              throw new Error(`Failed to fetch user info: ${userResponse.statusText}`);
          }

          // Discord APIからギルド情報を取得
          const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
              headers: {
                  Authorization: `Bearer ${accessToken}`
              }
          });

          if (guildsResponse.status !== 200) {
              throw new Error(`Failed to fetch guilds info: ${guildsResponse.statusText}`);
          }

          // ユーザーアイコンとニックネームをプロファイルに追加
          profile.avatarUrl = userResponse.data.avatar
              ? `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.png`
              : null;
          profile.nickname = userResponse.data.username;

          // ギルド情報をプロファイルに追加
          profile.guilds = guildsResponse.data.map(guild => ({
              id: guild.id,
              name: guild.name,
              iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null
          }));

          return done(null, profile);
      } catch (error) {
          console.error('Error during Discord login:', error);
          return done(error);
      }
}));
}

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// ミドルウェア設定
// リバースプロキシ配下（Ingress/LB）で secure cookie を正しく扱う
app.set('trust proxy', 1);

// Session config - do not auto-set cookie.domain from BASE_URL (use explicit COOKIE_DOMAIN if needed)
const BASE_URL = process.env.BASE_URL || '';
let cookieSecure = false;
let cookieSameSite = 'lax';
let cookieDomain = process.env.COOKIE_DOMAIN || undefined; // only use explicit env override

try {
  if (BASE_URL) {
    const parsedBase = new URL(BASE_URL);
    cookieSecure = parsedBase.protocol === 'https:';
    // Only set SameSite='none' when secure (required by browsers)
    if (cookieSecure) cookieSameSite = 'none';
  } else {
    cookieSecure = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';
    cookieSameSite = process.env.COOKIE_SAMESITE || 'lax';
  }
} catch (e) {
  console.warn('[SESSION] failed to parse BASE_URL for cookie settings:', e.message);
}

const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true, // リバースプロキシ配下では必須
  cookie: Object.assign({
    secure: cookieSecure,
    sameSite: cookieSameSite,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }, cookieDomain ? { domain: cookieDomain } : {}),
  name: 'connect.sid' // 明示的にCookie名を指定
};

console.log('[SESSION] cookie settings:', { 
  secure: sessionConfig.cookie.secure, 
  sameSite: sessionConfig.cookie.sameSite, 
  httpOnly: sessionConfig.cookie.httpOnly,
  domain: sessionConfig.cookie.domain || '(none)',
  name: sessionConfig.name,
  proxy: sessionConfig.proxy
});

if (redisStoreInstance) sessionConfig.store = redisStoreInstance;

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// 静的ファイル配信（Dockerfileでコピーした全ディレクトリを対象に）
app.use(express.static(__dirname));

// 追加：簡易リクエストロガー（デバッグ用）
app.use((req, res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url} Host:${req.headers.host} UA:${req.headers['user-agent']}`);
  next();
});

// SEO: ダッシュボードは認証後のみ表示されるため、検索エンジンにインデックスさせない
// HTTP レベルでも保証するため、X-Robots-Tag: noindex を /dashboard 以下に追加するミドルウェア
app.use((req, res, next) => {
  try {
    const u = req.url || req.path || '';
    // ダッシュボードのルートおよびその静的アセット（/dashboard/*, /dashboard.html 等）に対して付与
    if (u === '/dashboard' || u.startsWith('/dashboard') || u === '/dashboard.html' || u.startsWith('/dashboard/')) {
      res.set('X-Robots-Tag', 'noindex');
    }
  } catch (e) {
    // ヘッダー付与失敗でも処理は継続
    console.warn('[SEO] failed to set X-Robots-Tag', e && e.message);
  }
  next();
});

// Bot APIから統計データを取得して返すエンドポイント
// デフォルトではクラスタ内部DNS（FQDN）を使うようにする。
// 必要であれば環境変数で個別に上書き可能。
const BOT_NAMESPACE = process.env.BOT_NAMESPACE || 'aivis-chan-bot-web';
const CLUSTER_DOMAIN = process.env.CLUSTER_DOMAIN || 'svc.cluster.local';

function clusterUrl(svcName, port) {
  // 例: http://aivis-chan-bot-1st.default.svc.cluster.local:3002/api/stats
  return `http://${svcName}.${BOT_NAMESPACE}.${CLUSTER_DOMAIN}:${port}/api/stats`;
}

// --- Per Bot Port Mapping ---
// 実際: 1台目～6台目 = 3002～3007
// 環境変数で個別上書き可能 (BOT_1ST_PORT など) / あるいは BOT_BASE_PORT で連番開始指定
const BOT_BASE_PORT = parseInt(process.env.BOT_BASE_PORT || '3002', 10);
// 旧互換: BOT_SERVICE_PORT が指定され、個別ポート未指定の場合のみ fallback として利用
const LEGACY_SERVICE_PORT = process.env.BOT_SERVICE_PORT ? parseInt(process.env.BOT_SERVICE_PORT, 10) : null;
function resolvePort(envName, offset) {
  if (process.env[envName]) return parseInt(process.env[envName], 10);
  // 個別未指定で legacy が設定されている場合は legacy を使う（ただし base が変更されていれば base 優先）
  if (LEGACY_SERVICE_PORT != null && BOT_BASE_PORT === 3002 && !process.env.BOT_BASE_PORT) return LEGACY_SERVICE_PORT; // 旧挙動維持条件
  return BOT_BASE_PORT + offset;
}
const BOT_PORTS = {
  main: resolvePort('BOT_1ST_PORT', 0),
  second: resolvePort('BOT_2ND_PORT', 1),
  third: resolvePort('BOT_3RD_PORT', 2),
  fourth: resolvePort('BOT_4TH_PORT', 3),
  fifth: resolvePort('BOT_5TH_PORT', 4),
  sixth: resolvePort('BOT_6TH_PORT', 5),
  pro: resolvePort('BOT_PRO_PORT', 6)
};

const BOT_API_URLS = {
  main: process.env.BOT_API_URL     || clusterUrl('aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local', BOT_PORTS.main),
  second: process.env.BOT_API_URL_2ND || clusterUrl('aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local', BOT_PORTS.second),
  third: process.env.BOT_API_URL_3RD || clusterUrl('aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local', BOT_PORTS.third),
  fourth: process.env.BOT_API_URL_4TH || clusterUrl('aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local', BOT_PORTS.fourth),
  fifth: process.env.BOT_API_URL_5TH || clusterUrl('aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local', BOT_PORTS.fifth),
  sixth: process.env.BOT_API_URL_6TH || clusterUrl('aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local', BOT_PORTS.sixth),
  pro: process.env.BOT_API_URL_PRO || clusterUrl('aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local', BOT_PORTS.pro)
};

// 追加: bot-stats-server サービス (集約専用マイクロサービス) への委譲設定
// 例: Service 名: bot-stats-server (Port: BOT_STATS_SERVER_PORT=3000)
const BOT_STATS_SERVER_PORT = process.env.BOT_STATS_SERVER_PORT || '3001';
const BOT_STATS_SERVER_BASE = process.env.BOT_STATS_SERVER_URL || `http://bot-stats-server.${BOT_NAMESPACE}.${CLUSTER_DOMAIN}:${BOT_STATS_SERVER_PORT}`;
// 強制無効化したい場合は USE_BOT_STATS_SERVER=false を指定
const USE_BOT_STATS_SERVER = String(process.env.USE_BOT_STATS_SERVER || 'true').toLowerCase() !== 'false';

// Map known bot IDs (used by frontend) to the internal BOT_API_URLS entries
const BOT_ID_MAP = {
  '1333819940645638154': BOT_API_URLS.main,
  '1334732369831268352': BOT_API_URLS.second,
  '1334734681656262770': BOT_API_URLS.third,
  '1365633502988472352': BOT_API_URLS.fourth,
  '1365633586123771934': BOT_API_URLS.fifth,
  '1365633656173101086': BOT_API_URLS.sixth,
  '1415251855147008023': BOT_API_URLS.pro
};

// --- Internal fetch helper with multi-path fallback & structured debug ---
// Tries sequentially: /api/stats (existing supplied url), then /stats, then /metrics
// You can override fallback list via BOT_STATS_FALLBACK_PATHS (comma separated relative paths beginning with /)
async function fetchBotWithFallback(baseUrl, timeoutMs = 7000) {
  const urlsTried = [];
  const errors = [];
  // If baseUrl already ends with /api/stats keep that first, then build alternates.
  const parsed = new URL(baseUrl);
  const origin = `${parsed.protocol}//${parsed.host}`;
  const providedPath = parsed.pathname; // e.g. /api/stats
  const defaultFallbacks = ['/stats', '/metrics'];
  let candidatePaths = [providedPath];
  const envExtra = process.env.BOT_STATS_FALLBACK_PATHS;
  if (envExtra) {
    const list = envExtra.split(',').map(s => s.trim()).filter(Boolean);
    candidatePaths = Array.from(new Set([providedPath, ...list]));
  } else {
    // only add default fallbacks if not explicitly overridden
    defaultFallbacks.forEach(p => { if (!candidatePaths.includes(p)) candidatePaths.push(p); });
  }
  for (const p of candidatePaths) {
    const url = origin + p;
    urlsTried.push(url);
    try {
      const r = await axios.get(url, { timeout: timeoutMs });
      return { success: true, data: r.data, path_used: p, urls_tried: urlsTried, errors };
    } catch (e) {
      errors.push({ path: p, message: e.message, status: e?.response?.status });
    }
  }
  return { success: false, data: null, path_used: null, urls_tried: urlsTried, errors };
}

// API: aggregated bot stats expected by front-end
app.get('/api/bot-stats', async (req, res) => {
  let aggregatorError = null;
  const wantDebug = String(req.query.debug || 'false').toLowerCase() === 'true';
  const forceAggregator = String(req.query.forceAggregator || 'false').toLowerCase() === 'true';
  const noFallback = forceAggregator || String(req.query.noFallback || 'false').toLowerCase() === 'true';

  if (USE_BOT_STATS_SERVER) {
    try {
      const upstreamUrl = `${BOT_STATS_SERVER_BASE.replace(/\/$/, '')}/api/bot-stats`;
      const started = Date.now();
      const upstream = await axios.get(upstreamUrl, { timeout: 7000 });
      const latencyMs = Date.now() - started;
      if (upstream?.data && Array.isArray(upstream.data.bots)) {
        const payload = Object.assign({ via: 'aggregator', aggregator_latency_ms: latencyMs }, upstream.data);
        if (wantDebug) payload.debug = Object.assign(payload.debug||{}, { upstream_url: upstreamUrl });
        return res.json(payload);
      } else {
        aggregatorError = 'unexpected upstream shape';
        console.warn('[bot-stats] unexpected upstream shape from bot-stats-server, falling back');
      }
    } catch (e) {
      aggregatorError = e.message || String(e);
      console.warn('[bot-stats] bot-stats-server fetch failed, fallback to direct multi-fetch:', aggregatorError);
    }
  }

  if (noFallback && aggregatorError) {
    return res.status(502).json({ error: 'aggregator_failed', aggregator_error: aggregatorError, via: 'aggregator', fallback_attempted: false });
  }

  // fallback direct multi-fetch
  const botEntries = Object.entries(BOT_ID_MAP);
  const axiosTimeout = 7000;
  const results = await Promise.all(botEntries.map(async ([botId, url]) => {
    const fetched = await fetchBotWithFallback(url, axiosTimeout);
    if (!fetched.success) {
      return {
        bot_id: botId,
        success: false,
        error: 'fetch_failed',
        fetch_errors: fetched.errors,
        urls_tried: fetched.urls_tried
      };
    }
    const d = fetched.data || {};
    const server_count = Number.isFinite(Number(d.server_count ?? d.serverCount)) ? Number(d.server_count ?? d.serverCount) : 0;
    const user_count = Number.isFinite(Number(d.user_count ?? d.userCount)) ? Number(d.user_count ?? d.userCount) : 0;
    const vc_count = Number.isFinite(Number(d.vc_count ?? d.vcCount)) ? Number(d.vc_count ?? d.vcCount) : 0;
    const uptime = Number.isFinite(Number(d.uptime ?? d.uptimeRate ?? d.uptime_rate)) ? Number(d.uptime ?? d.uptimeRate ?? d.uptime_rate) : 0;
    const shard_count = Number.isFinite(Number(d.shard_count ?? d.shardCount)) ? Number(d.shard_count ?? d.shardCount) : (d.shardCount ? Number(d.shardCount) : 0);
    const online = d.online ?? d.is_online ?? (server_count > 0);
    return Object.assign({ bot_id: botId, success: true, path_used: fetched.path_used }, { server_count, user_count, vc_count, uptime, shard_count, online });
  }));
  const total_bots = results.length;
  const online_bots = results.filter(r => r.success && r.online).length;
  const payload = { bots: results, total_bots, online_bots, timestamp: new Date().toISOString(), fallback: true, aggregator_error: aggregatorError };
  if (wantDebug) payload.debug = { bot_namespace: BOT_NAMESPACE, base_port: BOT_BASE_PORT, per_bot_ports: BOT_PORTS, legacy_service_port: LEGACY_SERVICE_PORT, stats_server: BOT_STATS_SERVER_BASE, use_aggregator: USE_BOT_STATS_SERVER };
  return res.json(payload);
});

// API: single bot stats by botId
app.get('/api/bot-stats/:botId', async (req, res) => {
  const botId = req.params.botId;
  // まず集約サーバー（有効なら）を利用
  if (USE_BOT_STATS_SERVER) {
    try {
      const r = await axios.get(`${BOT_STATS_SERVER_BASE.replace(/\/$/, '')}/api/bot-stats/${botId}`, { timeout: 7000 });
      if (r?.data) return res.json(Object.assign({ via: 'aggregator' }, r.data));
    } catch (e) {
      console.warn(`[single-bot] aggregator fetch failed for ${botId}:`, e.message);
    }
  }
  const url = BOT_ID_MAP[botId];
  if (!url) return res.status(404).json({ error: 'unknown bot id' });
  try {
    const fetched = await fetchBotWithFallback(url, 7000);
    if (!fetched.success) {
      return res.status(502).json({ bot_id: botId, success: false, error: 'fetch_failed', fetch_errors: fetched.errors, urls_tried: fetched.urls_tried, fallback: true });
    }
    const d = fetched.data || {};
    const server_count = Number.isFinite(Number(d.server_count ?? d.serverCount)) ? Number(d.server_count ?? d.serverCount) : 0;
    const user_count = Number.isFinite(Number(d.user_count ?? d.userCount)) ? Number(d.user_count ?? d.userCount) : 0;
    const vc_count = Number.isFinite(Number(d.vc_count ?? d.vcCount)) ? Number(d.vc_count ?? d.vcCount) : 0;
    const uptime = Number.isFinite(Number(d.uptime ?? d.uptimeRate ?? d.uptime_rate)) ? Number(d.uptime ?? d.uptimeRate ?? d.uptime_rate) : 0;
    const shard_count = Number.isFinite(Number(d.shard_count ?? d.shardCount)) ? Number(d.shard_count ?? d.shardCount) : (d.shardCount ? Number(d.shardCount) : 0);
    const online = d.online ?? d.is_online ?? (server_count > 0);
    return res.json(Object.assign({ bot_id: botId, success: true, fallback: true, path_used: fetched.path_used }, { server_count, user_count, vc_count, uptime, shard_count, online }));
  } catch (err) {
    const status = err?.response?.status;
    const respBody = err?.response?.data;
    let briefBody = '';
    try {
      briefBody = typeof respBody === 'string' ? respBody.slice(0, 1000) : JSON.stringify(respBody).slice(0, 1000);
    } catch (e) {
      briefBody = String(respBody).slice(0, 1000);
    }
    console.warn(`Failed to fetch stats for ${botId} from ${url}: ${err.message} status=${status} body=${briefBody}`);
    return res.status(502).json({ bot_id: botId, success: false, error: err.message, upstream_status: status, upstream_body: briefBody, fallback: true });
  }
});

// Debug endpoint: returns current config & raw attempt (without caching)
app.get('/api/debug-bot-stats', async (req, res) => {
  const axiosTimeout = 5000;
  const detail = await Promise.all(Object.entries(BOT_ID_MAP).map(async ([botId, url]) => {
    const fetched = await fetchBotWithFallback(url, axiosTimeout);
    return { bot_id: botId, url, fetched };
  }));
  res.json({ namespace: BOT_NAMESPACE, base_port: BOT_BASE_PORT, per_bot_ports: BOT_PORTS, legacy_service_port: LEGACY_SERVICE_PORT, aggregator: BOT_STATS_SERVER_BASE, use_aggregator: USE_BOT_STATS_SERVER, detail });
});

// Aggregator 直接テスト用: フォールバック無しで結果/失敗を返す
app.get('/api/debug-aggregator', async (req, res) => {
  if (!USE_BOT_STATS_SERVER) return res.status(400).json({ error: 'aggregator_disabled' });
  const upstreamUrl = `${BOT_STATS_SERVER_BASE.replace(/\/$/, '')}/api/bot-stats`;
  const started = Date.now();
  try {
    const r = await axios.get(upstreamUrl, { timeout: 7000 });
    const latencyMs = Date.now() - started;
    if (!r?.data) return res.status(502).json({ error: 'no_data', upstream_url: upstreamUrl });
    return res.json({ upstream_url: upstreamUrl, latency_ms: latencyMs, data_shape: { bots: Array.isArray(r.data.bots), keys: Object.keys(r.data||{}) }, raw: r.data });
  } catch (e) {
    return res.status(502).json({ error: 'aggregator_request_failed', message: e.message, upstream_url: upstreamUrl });
  }
});

// Bot統計情報を取得（全ボットインスタンスのステータスを集約）
app.get('/api/bot-stats', async (req, res) => {
    try {
        const botUrls = [
            process.env.BOT_1ST_URL || 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002',
            process.env.BOT_2ND_URL || 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003',
            process.env.BOT_3RD_URL || 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004',
            process.env.BOT_4TH_URL || 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005',
            process.env.BOT_5TH_URL || 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006',
            process.env.BOT_6TH_URL || 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007',
            process.env.BOT_PRO_PREMIUM_URL || 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012'
        ];

        const botStatusPromises = botUrls.map(async (url) => {
            try {
                const response = await axios.get(`${url}/health`, { timeout: 5000 });
                return { 
                    url, 
                    success: response.status === 200,
                    status: response.status 
                };
            } catch (error) {
                return { 
                    url, 
                    success: false, 
                    error: error.message 
                };
            }
        });

        const results = await Promise.allSettled(botStatusPromises);
        const bots = results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: 'timeout' });
        
        const stats = {
            total_bots: bots.length,
            online_bots: bots.filter(b => b.success).length,
            offline_bots: bots.filter(b => !b.success).length,
            bots: bots
        };

        res.json(stats);
    } catch (error) {
        console.error('Failed to get bot stats:', error);
        res.status(500).json({ error: 'Failed to retrieve bot statistics' });
    }
});

// 認証チェックミドルウェア
function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// ルートはindex.htmlを返す
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ログインページ
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Discord認証開始（無料版）
app.get('/auth/discord/:version', (req, res, next) => {
    const version = req.params.version || "free";
  if (!passport._strategies[`discord-${version}`]) return res.status(500).send(`discord-${version} not configured`);
  return passport.authenticate(`discord-${version}`)(req, res, next);
});

// Discord認証開始（デフォルト - 後方互換性）
app.get('/auth/discord', (req, res, next) => {
  if (!passport._strategies['discord']) return res.status(500).send('discord strategy not configured');
  return passport.authenticate('discord')(req, res, next);
});

// Discord認証コールバック（無料版/Pro版共通）
app.get('/auth/discord/callback/:version', (req, res, next) => {
  const version = req.params.version || 'free';
  const strategy = `discord-${version}`;
  if (!passport._strategies || !passport._strategies[strategy]) {
    console.warn('[AUTH] strategy not available:', strategy);
    return res.redirect('/login');
  }

  passport.authenticate(strategy, { session: true }, (err, user, info) => {
    try {
      console.log('[AUTH DEBUG] passport callback raw:', { 
        err: err && String(err.message || err), 
        user: user ? (user.id || user.username || '[user]') : null, 
        info,
        userType: typeof user,
        userKeys: user ? Object.keys(user) : []
      });
      
      if (err) {
        console.error('[AUTH DEBUG] authenticate error:', err && (err.stack || err));
        try {
          console.error('[AUTH DEBUG] oauth error details:', {
            name: err.name,
            message: err.message,
            status: err.status || err.statusCode || null,
            data: err.data || err.oauthError || (err.response && err.response.data) || null
          });
        } catch (ee) {}
        return res.status(500).send('authentication error');
      }
      
      if (!user) {
        console.warn('[AUTH DEBUG] authenticate returned no user, info=', info);
        return res.redirect('/login');
      }
      
      // アクセストークンをセッションに保存
      if (info && info.accessToken) {
        req.session.accessToken = info.accessToken;
        console.log('[AUTH DEBUG] Access token saved to session');
      } else if (user && user.accessToken) {
        req.session.accessToken = user.accessToken;
        console.log('[AUTH DEBUG] Access token saved from user object');
      }
      
      // ログイン処理
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('[AUTH DEBUG] req.logIn failed:', loginErr && (loginErr.stack || loginErr.message || loginErr));
          return res.status(500).send('login failed');
        }
        
        if (req.session) {
          req.session.save((saveErr) => {
            if (saveErr) console.warn('[SESSION] save after oauth failed:', saveErr && (saveErr.message || saveErr));
            console.log('[AUTH DEBUG] login success sessionID=', req.sessionID, 
              'user.id=', user.id, 'guilds=', user.guilds?.length || 0);
            return res.redirect(`/dashboard?version=${version}`);
          });
        } else {
          console.log('[AUTH DEBUG] login success but no session object');
          return res.redirect(`/dashboard?version=${version}`);
        }
      });
    } catch (inner) {
      console.error('[AUTH DEBUG] unexpected error in callback handler:', inner && (inner.stack || inner.message || inner));
      return res.status(500).send('internal handler error');
    }
  })(req, res, next);
});

// Backwards-compatible callback route: handle redirects to /auth/discord/callback (no :version)
app.get('/auth/discord/callback', (req, res, next) => {
  try {
    const versionQuery = req.query.version || req.query.v;
    const version = String(versionQuery || 'free');

    let strategyName = null;
    if (passport._strategies && passport._strategies[`discord-${version}`]) {
      strategyName = `discord-${version}`;
    } else if (passport._strategies && passport._strategies['discord']) {
      strategyName = 'discord';
    } else if (passport._strategies && passport._strategies['discord-free']) {
      strategyName = 'discord-free';
    }

    if (!strategyName) {
      console.warn('[auth] No Discord strategy available to handle callback');
      return res.redirect('/login');
    }

    return passport.authenticate(strategyName, { failureRedirect: '/login' })(req, res, () => {
      if (req.session) {
        req.session.save((err) => {
          if (err) console.warn('[SESSION] save after oauth failed:', err && (err.message || err));
          try {
            console.log(`[AUTH DEBUG] callback(no-version) strategy=${strategyName} sessionID=${req.sessionID} isAuthenticated=${typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : '(n/a)'} user=${req.user ? (req.user.id || req.user.username || '[user]') : '(none)'}`);
          } catch (e) {}
          return res.redirect(`/dashboard?version=${version}`);
        });
      } else {
        try {
          console.log(`[AUTH DEBUG] callback(no-version) no session object present`);
        } catch (e) {}
        return res.redirect(`/dashboard?version=${version}`);
      }
    });
  } catch (e) {
    console.error('[auth] callback (no-version) handler error:', e);
    return res.redirect('/login');
  }
});

// ログアウト
app.get('/logout', (req, res) => {
  // Passport 0.6+: req.logout requires callback
  req.logout(err => {
    if (err) console.error('Logout error:', err);
    // Destroy the session
    req.session?.destroy(() => {
      res.clearCookie('connect.sid');
      return res.redirect('/login');
    });
  });
});

// クライアント用：現在のセッション状態を返す
app.get('/api/session', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  const isAuth = req.isAuthenticated && req.isAuthenticated();
  
  console.log('[DEBUG] /api/session called');
  console.log('[DEBUG] isAuthenticated:', isAuth);
  console.log('[DEBUG] req.user:', req.user ? { id: req.user.id, username: req.user.username, guilds: req.user.guilds?.length || 0 } : 'null');
  console.log('[DEBUG] sessionID:', req.sessionID);
  console.log('[DEBUG] session.cookie:', req.session?.cookie);
  console.log('[DEBUG] cookies from request:', req.headers.cookie?.split(';').map(c => c.trim().split('=')[0]));
  
  if (isAuth && req.user) {
    return res.json({ 
      authenticated: true, 
      user: {
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        avatarUrl: req.user.avatarUrl,
        guilds: req.user.guilds || []
      }
    });
  }
  return res.json({ authenticated: false });
});

// プレミアムステータス取得API
app.get('/api/premium-status', requireAuth, async (req, res) => {
    try {
        // Patreon連携やデータベースからプレミアムステータスを確認
        const userId = req.user.id;

        // 仮の実装：Patreon連携データを確認
        const patreonLink = await getPatreonLink(userId);
        const isPremium = patreonLink && patreonLink.patreonId;

        const premiumData = {
            isPremium: isPremium,
            tier: isPremium ? 'スタンダード' : null,
            expiryDate: isPremium ? '2025-12-31' : null, // 仮の有効期限
            features: isPremium ? ['tts', 'priority', 'dict', 'analytics', 'backup', 'support'] : []
        };

        res.json(premiumData);
    } catch (error) {
        console.error('Premium status error:', error);
        res.status(500).json({ error: 'プレミアムステータスの取得に失敗しました' });
    }
});

// プレミアム設定取得API
app.get('/api/premium-settings', requireAuth, (req, res) => {
    try {
        // ローカルストレージやデータベースから設定を取得
        const userId = req.user.id;
        const settingsKey = `premium_settings_${userId}`;

        // 仮の実装：デフォルト設定を返す
        const defaultSettings = {
            tts: false,
            priority: false,
            dict: false,
            analytics: false,
            backup: false,
            support: false
        };

        // 実際の実装ではデータベースから取得
        const settings = defaultSettings; // 仮

        res.json(settings);
    } catch (error) {
        console.error('Premium settings error:', error);
        res.status(500).json({ error: 'プレミアム設定の取得に失敗しました' });
    }
});

// プレミアム設定保存API
app.post('/api/premium-settings', requireAuth, express.json(), (req, res) => {
    try {
        const userId = req.user.id;
        const settings = req.body;

        // 設定を保存（データベースやファイルに）
        const settingsKey = `premium_settings_${userId}`;

        // 仮の実装：コンソールに出力
        console.log(`Saving premium settings for user ${userId}:`, settings);

        // 実際の実装ではデータベースに保存
        // await saveToDatabase(settingsKey, settings);

        res.json({ success: true, message: '設定を保存しました' });
    } catch (error) {
        console.error('Premium settings save error:', error);
        res.status(500).json({ error: '設定の保存に失敗しました' });
    }
});

// プレミアム統計取得API
app.get('/api/premium-stats', requireAuth, (req, res) => {
    try {
        const userId = req.user.id;

        // 仮の実装：サンプル統計データを返す
        const stats = {
            usageTime: 42,
            messagesProcessed: 1250,
            responseTime: 150,
            utilization: 75
        };

        // 実際の実装ではデータベースから取得
        // const stats = await getPremiumStats(userId);

        res.json(stats);
    } catch (error) {
        console.error('Premium stats error:', error);
        res.status(500).json({ error: '統計データの取得に失敗しました' });
    }
});

// 設定保存エンドポイント
app.post('/api/settings', async (req, res) => {
    try {
        const { guildId, settings } = req.body;
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        console.log(`[API /api/settings] Saving settings for guild: ${guildId}`);
        
        // ファイルに保存
        const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'settings.json');
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        
        // 全Botに通知
        const notifyResults = await Promise.allSettled(
            BOT_INSTANCES.map(async (bot) => {
                const url = `${bot.url}/api/settings/notify`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guildId, settings })
                });
                
                if (!response.ok) {
                    throw new Error(`${response.status}`);
                }
                return { bot: bot.name, success: true };
            })
        );
        
        notifyResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.log(`Failed to notify bot at ${BOT_INSTANCES[index].url}: ${result.reason.message}`);
            }
        });
        
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error('[API /api/settings] Error:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// 個人設定保存エンドポイント
app.post('/api/personal-settings', async (req, res) => {
    try {
        const { guildId, settings } = req.body;
        const userId = req.user?.id;
        
        if (!guildId || !userId) {
            return res.status(400).json({ error: 'guildId and userId are required' });
        }

        console.log(`[API /api/personal-settings] Saving personal settings for guild: ${guildId}, user: ${userId}`);
        
        const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'personal', `${userId}.json`);
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        
        // 全Botに通知
        const notifyResults = await Promise.allSettled(
            BOT_INSTANCES.map(async (bot) => {
                const url = `${bot.url}/api/personal-settings/notify`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guildId, userId, settings })
                });
                
                if (!response.ok) {
                    throw new Error(`${response.status}`);
                }
                return { bot: bot.name, success: true };
            })
        );
        
        notifyResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.log(`Failed to notify bot at ${BOT_INSTANCES[index].url}: ${result.reason.message}`);
            }
        });
        
        res.json({ success: true, message: 'Personal settings saved successfully' });
    } catch (error) {
        console.error('[API /api/personal-settings] Error:', error);
        res.status(500).json({ error: 'Failed to save personal settings' });
    }
});

// 辞書保存エンドポイント
app.post('/api/dictionary', async (req, res) => {
    try {
        const { guildId, dictionary } = req.body;
        
        if (!guildId) {
            return res.status(400).json({ error: 'guildId is required' });
        }

        console.log(`[API /api/dictionary] Saving dictionary for guild: ${guildId}`);
        
        const dictPath = path.join(__dirname, 'data', 'guilds', guildId, 'dictionary.json');
        await fs.mkdir(path.dirname(dictPath), { recursive: true });
        await fs.writeFile(dictPath, JSON.stringify(dictionary, null, 2));
        
        // 全Botに通知
        const notifyResults = await Promise.allSettled(
            BOT_INSTANCES.map(async (bot) => {
                const url = `${bot.url}/api/dictionary/notify`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guildId, dictionary })
                });
                
                if (!response.ok) {
                    throw new Error(`${response.status}`);
                }
                return { bot: bot.name, success: true };
            })
        );
        
        notifyResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.log(`Failed to notify bot at ${BOT_INSTANCES[index].url}: ${result.reason.message}`);
            }
        });
        
        res.json({ success: true, message: 'Dictionary saved successfully' });
    } catch (error) {
        console.error('[API /api/dictionary] Error:', error);
        res.status(500).json({ error: 'Failed to save dictionary' });
    }
});

// Redisヘルスチェックエンドポイント
app.get('/health/redis', async (req, res) => {
  if (!redisStoreInstance) {
   
   
    return res.status(503).json({ status: 'Redis not configured' });
  }

  try {
    await redisStoreInstance.client.ping();
    res.json({ status: 'Redis connected' });
  } catch (error) {
    res.status(503).json({ status: 'Redis connection failed', error: error.message });
  }
});

// Ensure we actually start listening and log it (add/replace at end of file)
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`[LISTEN] app listening on ${HOST}:${PORT} (PID ${process.pid})`);
  });
}

// Replace fallback pro-callback with explicit callback handling too
app.get('/auth/discord/callback/pro', (req, res, next) => {
  const preferred = passport._strategies && (passport._strategies['discord-pro'] ? 'discord-pro' : (passport._strategies['discord'] ? 'discord' : (passport._strategies['discord-free'] ? 'discord-free' : null)));
  if (!preferred) {
    console.warn('[auth] no discord strategy available for pro callback');
    return res.redirect('/login');
  }

  passport.authenticate(preferred, { session: true }, (err, user, info) => {
    try {
      console.log('[AUTH DEBUG] pro callback raw:', { strategy: preferred, err: err && String(err.message || err), user: user ? (user.id || user.username || '[user]') : null, info });
      if (err) {
        console.error('[AUTH DEBUG] authenticate error (pro):', err && (err.stack || err.message || err));
        return res.status(500).send('authentication error');
      }
      if (!user) {
        console.warn('[AUTH DEBUG] authenticate returned no user (pro), info=', info);
        return res.redirect('/login');
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('[AUTH DEBUG] req.logIn failed (pro):', loginErr && (loginErr.stack || loginErr.message || loginErr));
          return res.status(500).send('login failed');
        }
        if (req.session) {
          req.session.save((saveErr) => {
            if (saveErr) console.warn('[SESSION] save after oauth failed (pro):', saveErr && (saveErr.message || saveErr));
            console.log('[AUTH DEBUG] pro login success sessionID=', req.sessionID);
            return res.redirect('/dashboard?version=pro');
          });
        } else {
          console.log('[AUTH DEBUG] pro login success but no session object');
          return res.redirect('/dashboard?version=pro');
        }
      });
    } catch (inner) {
      console.error('[AUTH DEBUG] unexpected error in pro callback handler:', inner && (inner.stack || inner.message || inner));
      return res.status(500).send('internal handler error');
    }
  })(req, res, next);
});

// Helper function to notify all bot instances of settings changes
async function notifyBotsSettingsUpdate(guildId, settings) {
       const botUrls = [
        process.env.BOT_1ST_URL || 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002',
        process.env.BOT_2ND_URL || 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003',
        process.env.BOT_3RD_URL || 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004',
        process.env.BOT_4TH_URL || 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005',
        process.env.BOT_5TH_URL || 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006',
        process.env.BOT_6TH_URL || 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007',
        process.env.BOT_PRO_PREMIUM_URL || 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012'
    ];
    const notifyPromises = botUrls.map(async (url) => {
        try {
            const response = await fetch(`${url}/internal/apply-web-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guildId, settings })
            });
            if (!response.ok) {
                console.warn(`Failed to notify bot at ${url}: ${response.status}`);
            }
        } catch (error) {
            console.warn(`Error notifying bot at ${url}:`, error.message);
        }
    });

    await Promise.allSettled(notifyPromises);
}

// Helper: decode base64-encoded JSON or plain base64 numeric ID
function tryDecodeBase64Json(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    const decoded = Buffer.from(input, 'base64').toString('utf8');
    console.log('[PATREON] Base64 decoded value:', decoded);
    
    // First check if it's a plain numeric ID (most common case)
    if (/^\d{15,22}$/.test(decoded)) {
      console.log('[PATREON] Decoded as plain numeric Discord ID:', decoded);
      return decoded;
    }
    
    // Try JSON parse for complex objects
    try {
      const parsed = JSON.parse(decoded);
      if (parsed && parsed.discordId) {
        console.log('[PATREON] Decoded as JSON with discordId:', parsed.discordId);
        return String(parsed.discordId);
      }
    } catch (e) {
      // not JSON, already checked for numeric above
      console.log('[PATREON] Base64 content is not JSON and not numeric:', decoded);
    }
  } catch (e) {
    // not valid base64
    console.log('[PATREON] Failed to decode base64:', e.message);
  }
  return null;
}

// Helper: save Patreon link to file
function savePatreonLink(linkData) {
  try {
    const dir = path.dirname(PATREON_LINKS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let links = [];
    if (fs.existsSync(PATREON_LINKS_FILE)) {
      try {
        const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8');
        links = JSON.parse(raw);
        if (!Array.isArray(links)) links = [];
      } catch (e) {
        console.warn('[PATREON] Failed to parse existing links file:', e.message);
        links = [];
      }
    }
    
    // Remove existing link for this discordId
    links = links.filter(l => String(l.discordId) !== String(linkData.discordId));
    
    // Add new link
    links.push(linkData);
    
    fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify(links, null, 2), 'utf8');
    console.log('[PATREON] Saved link to file:', PATREON_LINKS_FILE);
  } catch (e) {
    console.error('[PATREON] Failed to save link:', e);
    throw e;
  }
}

// Helper: append to Patreon callback log
function appendPatreonCallbackLog(entry) {
  try {
    const logFile = path.join('/tmp', 'data', 'patreon_callback.log');
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.warn('[PATREON] Failed to append callback log:', e.message);
  }
}

// Helper: get Patreon link for a user
async function getPatreonLink(discordId) {
  try {
    if (!fs.existsSync(PATREON_LINKS_FILE)) return null;
    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8');
    const links = JSON.parse(raw);
    if (!Array.isArray(links)) return null;
    return links.find(l => String(l.discordId) === String(discordId)) || null;
  } catch (e) {
    console.warn('[PATREON] Failed to get link:', e.message);
    return null;
  }
}

// Global dictionary cache
const GLOBAL_DICT_CACHE = {
  entries: null,
  fetchedAt: null,
  errorUntil: null
};
const GLOBAL_DICT_CACHE_TTL = parseInt(process.env.GLOBAL_DICT_CACHE_TTL_MS || String(5 * 60 * 1000), 10);

// Patreon OAuth callback handler
app.get('/auth/patreon/callback', async (req, res) => {
   const { code, state } = req.query;
   try {
     console.log('[PATREON] Callback received:', { code: code ? `***${String(code).slice(-4)}` : 'missing', state: state || 'missing', ip: req.ip });
     appendPatreonCallbackLog({ ts: new Date().toISOString(), ip: req.ip, ua: req.headers['user-agent'], event: 'callback_received', code: code ? ('***' + String(code).slice(-4)) : null, state: state || null });
   } catch (e) { /* non-fatal */ }

   if (!code || !state) {
     console.error('[PATREON] Missing required parameters:', { code: !!code, state: !!state });
     appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_missing_params', state: state || null });
     return res.status(400).send('Missing required parameters. Please try linking again.');
   }
   if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET) {
     console.error('[PATREON] Client credentials not configured in callback');
     appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_not_configured' });
     return res.status(500).send('Patreon client not configured. Please contact administrator.');
   }
   if (!PATREON_REDIRECT_URI) {
     console.error('[PATREON] REDIRECT_URI not configured in callback');
     return res.status(500).send('Patreon redirect URI not configured. Please contact administrator.');
   }

   // exchange code for token
   try {
     console.log('[PATREON] Attempting token exchange...');
     const tokenResp = await axios.post('https://www.patreon.com/api/oauth2/token', new URLSearchParams({
       grant_type: 'authorization_code',
       code: String(code),
       client_id: PATREON_CLIENT_ID,
       client_secret: PATREON_CLIENT_SECRET,
       redirect_uri: PATREON_REDIRECT_URI
     }).toString(), { 
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       timeout: 10000
     });

     const tokenData = tokenResp.data;
     console.log('[PATREON] Token exchange successful');
     
     // get patreon identity
     console.log('[PATREON] Fetching Patreon identity...');
     const meResp = await axios.get('https://www.patreon.com/api/oauth2/v2/identity', { 
       headers: { Authorization: `Bearer ${tokenData.access_token}` },
       timeout: 10000
     });
     const patreonId = meResp.data?.data?.id || null;
     console.log('[PATREON] Identity fetched, patreonId:', patreonId);

     // Parse state to extract discordId
     let discordId = null;
     let guildId = undefined;

     console.log('[PATREON] Parsing state:', state);
     
     // Strategy 1: Check if state contains colon (format: "discordId:random" or "base64:random")
     if (String(state).includes(':')) {
       const left = String(state).split(':', 1)[0];
       console.log('[PATREON] State contains colon, left part:', left);
       
       // Try to decode left part as base64
       const decoded = tryDecodeBase64Json(left);
       if (decoded) {
         discordId = decoded;
         console.log('[PATREON] Decoded discordId from colon-separated base64:', discordId);
       } else if (/^\d{15,22}$/.test(left)) {
         // Left part is already a plain numeric ID
         discordId = left;
         console.log('[PATREON] Extracted plain discordId from colon-separated state:', discordId);
       }
     }
     
     // Strategy 2: If no colon, try direct base64 decode
     if (!discordId) {
       console.log('[PATREON] No colon found, trying direct base64 decode');
       const decoded = tryDecodeBase64Json(state);
       if (decoded) {
         discordId = decoded;
         console.log('[PATREON] Decoded discordId from direct base64:', discordId);
       }
     }
     
     // Strategy 3: Check if state itself is a plain numeric ID
     if (!discordId && /^\d{15,22}$/.test(String(state))) {
       discordId = String(state);
       console.log('[PATREON] State is plain numeric Discord ID:', discordId);
     }

     if (!discordId) {
       console.error('[PATREON] Failed to extract discordId from state:', state);
       appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_invalid_state', state: state || null });
       return res.status(400).send('Invalid state parameter. Please try linking again.');
     }

     // Save the link and persist
     savePatreonLink({ discordId: discordId || '', patreonId, tokenData, guildId, createdAt: new Date().toISOString() });

     console.log('[PATREON] Link saved successfully:', { discordId, patreonId });
     appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_success', discordId: String(discordId), patreonId: patreonId || null });

     // Redirect to success page
     const successPath = `/auth/patreon/success.html?discordId=${encodeURIComponent(discordId)}&patreonId=${encodeURIComponent(patreonId || '')}&ts=${Date.now()}`;
     return res.redirect(successPath);
   } catch (e) {
     const errStatus = e?.response?.status || 'no-status';
     const errBody = e?.response?.data ? (typeof e.response.data === 'string' ? e.response.data.slice(0,1000) : JSON.stringify(e.response.data).slice(0,1000)) : (e.message || String(e));
     console.error('[PATREON] Callback error:', { status: errStatus, message: e.message, body: errBody });
     appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_error', error: errBody, state: state || null });
     return res.status(500).send(`Failed to link Patreon account. Error: ${e.message || 'Unknown error'}. Please try again or contact support.`);
   }
 });

// ギルドのチャンネル一覧を取得
app.get('/api/guilds/:guildId', async (req, res) => {
  const { guildId } = req.params;
  console.log(`[API /api/guilds/${guildId}] Request received`);
  
  try {
    // 認証チェック
    const isAuth = req.isAuthenticated && req.isAuthenticated();
    if (!isAuth || !req.user) {
      console.log(`[API /api/guilds/${guildId}] Not authenticated`);
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const BOTS = [
      { name: '1st', baseUrl: 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002' },
      { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003' },
      { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004' },
      { name: '4th', baseUrl: 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005' },
      { name: '5th', baseUrl: 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006' },
      { name: '6th', baseUrl: 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007' },
      { name: 'pro-premium', baseUrl: 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012' }
    ];

    // 各Botからチャンネル情報を取得（並列処理で高速化）
    const channelPromises = BOTS.map(async (bot) => {
      try {
        console.log(`[API /api/guilds/${guildId}] Trying ${bot.name}`);
        const response = await axios.get(`${bot.baseUrl}/api/guilds/${guildId}`, {
          timeout: 3000,
          validateStatus: (status) => status < 500
        });
        
        if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
          console.log(`[API /api/guilds/${guildId}] Got ${response.data.length} channels from ${bot.name}`);
          return { success: true, data: response.data, bot: bot.name };
        }
        
        return { success: false, bot: bot.name, reason: 'empty_or_invalid_response' };
      } catch (error) {
        console.warn(`[API /api/guilds/${guildId}] ${bot.name} failed:`, error.message);
        return { success: false, bot: bot.name, error: error.message };
      }
    });

    const results = await Promise.all(channelPromises);
    
    // 最初に成功したBotのチャンネル情報を返す
    const successResult = results.find(r => r.success);
    
    if (successResult) {
      console.log(`[API /api/guilds/${guildId}] Returning ${successResult.data.length} channels from ${successResult.bot}`);
      return res.json(successResult.data);
    }
    
    // すべてのBotが失敗した場合
    console.error(`[API /api/guilds/${guildId}] All bots failed:`, results);
    res.status(503).json({ 
      error: 'No channels available',
      details: results.map(r => ({ bot: r.bot, success: r.success, reason: r.reason || r.error }))
    });
    
  } catch (error) {
    console.error(`[API /api/guilds/${guildId}] Fatal error:`, error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});
