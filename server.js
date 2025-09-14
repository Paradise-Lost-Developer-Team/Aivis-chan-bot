const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
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

// Discord OAuth2設定（無料版とPro/Premium版）
const DISCORD_CONFIG_FREE = {
  clientId: process.env.DISCORD_CLIENT_ID_FREE || process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_FREE || process.env.DISCORD_CLIENT_SECRET,
  redirectUri: process.env.DISCORD_REDIRECT_URI_FREE || process.env.DISCORD_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3001'}/auth/discord/callback`,
  version: 'free'
};

const DISCORD_CONFIG_PRO = {
  clientId: process.env.DISCORD_CLIENT_ID_PRO,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_PRO,
  redirectUri: process.env.DISCORD_REDIRECT_URI_PRO || process.env.DISCORD_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3001'}/auth/discord/callback`,
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
  }, (accessToken, refreshToken, profile, done) => {
      // バージョン情報を追加
      profile.version = 'free';
      // Try to enrich profile with avatar/guild icon info like the default strategy
      (async () => {
        try {
          const [userResp, guildsResp] = await Promise.all([
            axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } }),
            axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } })
          ]);
          if (userResp.status === 200) {
            profile.avatarUrl = userResp.data.avatar ? `https://cdn.discordapp.com/avatars/${userResp.data.id}/${userResp.data.avatar}.png` : null;
            profile.nickname = userResp.data.username;
          }
          if (guildsResp.status === 200) {
            profile.guilds = guildsResp.data.map(guild => ({ id: guild.id, name: guild.name, iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null }));
          }
        } catch (e) {
          console.warn('[passport][discord-free] failed to enrich profile:', e.message || e);
          // proceed without enrichment
        }
        return done(null, profile);
      })();
  }));
}

// Passport設定（Pro/Premium版） - 必須値がある場合のみ登録
if (DISCORD_CONFIG_PRO.clientId && DISCORD_CONFIG_PRO.clientSecret) {
  passport.use('discord-pro', new DiscordStrategy({
      clientID: DISCORD_CONFIG_PRO.clientId,
      clientSecret: DISCORD_CONFIG_PRO.clientSecret,
      callbackURL: DISCORD_CONFIG_PRO.redirectUri,
      scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
      // バージョン情報を追加
      profile.version = 'pro';
      // Enrich profile with avatar/guild icon info when possible
      (async () => {
        try {
          const [userResp, guildsResp] = await Promise.all([
            axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } }),
            axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } })
          ]);
          if (userResp.status === 200) {
            profile.avatarUrl = userResp.data.avatar ? `https://cdn.discordapp.com/avatars/${userResp.data.id}/${userResp.data.avatar}.png` : null;
            profile.nickname = userResp.data.username;
          }
          if (guildsResp.status === 200) {
            profile.guilds = guildsResp.data.map(guild => ({ id: guild.id, name: guild.name, iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null }));
          }
        } catch (e) {
          console.warn('[passport][discord-pro] failed to enrich profile:', e.message || e);
        }
        return done(null, profile);
      })();
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

// セッション設定（Redis or Memory）
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',            // HTTPS時のみSecure付与
    sameSite: 'lax',           // OAuthリダイレクトで送られる
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }
};

// Redisストアが利用可能な場合は使用
if (redisStoreInstance) {
  sessionConfig.store = redisStoreInstance;
}

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
  main: process.env.BOT_API_URL     || clusterUrl('aivis-chan-bot-1st', BOT_PORTS.main),
  second: process.env.BOT_API_URL_2ND || clusterUrl('aivis-chan-bot-2nd', BOT_PORTS.second),
  third: process.env.BOT_API_URL_3RD || clusterUrl('aivis-chan-bot-3rd', BOT_PORTS.third),
  fourth: process.env.BOT_API_URL_4TH || clusterUrl('aivis-chan-bot-4th', BOT_PORTS.fourth),
  fifth: process.env.BOT_API_URL_5TH || clusterUrl('aivis-chan-bot-5th', BOT_PORTS.fifth),
  sixth: process.env.BOT_API_URL_6TH || clusterUrl('aivis-chan-bot-6th', BOT_PORTS.sixth),
  pro: process.env.BOT_API_URL_PRO || clusterUrl('aivis-chan-bot-pro-premium', BOT_PORTS.pro)
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

app.get('/bot-stats', async (req, res) => {
    try {
        const response = await axios.get(BOT_API_URLS.main);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Bot APIからデータ取得に失敗しました', details: err.message });
    }
});
app.get('/bot-stats-2nd', async (req, res) => {
    try {
        const response = await axios.get(BOT_API_URLS.second);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: '2nd Bot APIからデータ取得に失敗しました', details: err.message });
    }
});
app.get('/bot-stats-3rd', async (req, res) => {
    try {
        const response = await axios.get(BOT_API_URLS.third);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: '3rd Bot APIからデータ取得に失敗しました', details: err.message });
    }
});
app.get('/bot-stats-4th', async (req, res) => {
    try {
        const response = await axios.get(BOT_API_URLS.fourth);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: '4th Bot APIからデータ取得に失敗しました', details: err.message });
    }
});
app.get('/bot-stats-5th', async (req, res) => {
    try {
        const response = await axios.get(BOT_API_URLS.fifth);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: '5th Bot APIからデータ取得に失敗しました', details: err.message });
    }
});
app.get('/bot-stats-6th', async (req, res) => {
    try {
        const response = await axios.get(BOT_API_URLS.sixth);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: '6th Bot APIからデータ取得に失敗しました', details: err.message });
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
app.get('/auth/discord/free', (req, res, next) => {
  if (!passport._strategies['discord-free']) return res.status(500).send('discord-free not configured');
  return passport.authenticate('discord-free')(req, res, next);
});

// Discord認証開始（Pro/Premium版）
app.get('/auth/discord/pro', (req, res, next) => {
  if (!passport._strategies['discord-pro']) return res.status(500).send('discord-pro not configured');
  return passport.authenticate('discord-pro')(req, res, next);
});

// Discord認証開始（デフォルト - 後方互換性）
app.get('/auth/discord', (req, res, next) => {
  if (!passport._strategies['discord']) return res.status(500).send('discord strategy not configured');
  return passport.authenticate('discord')(req, res, next);
});

// Discord認証コールバック（無料版）
app.get('/auth/discord/callback/free', (req, res, next) => {
  if (!passport._strategies['discord-free']) return res.redirect('/login');
  return passport.authenticate('discord-free', { failureRedirect: '/login' })(req, res, () => {
    res.redirect('/dashboard?version=free');
  });
});

// Discord認証コールバック（Pro/Premium版）
app.get('/auth/discord/callback/pro', (req, res, next) => {
  if (!passport._strategies['discord-pro']) return res.redirect('/login');
  return passport.authenticate('discord-pro', { failureRedirect: '/login' })(req, res, () => {
    res.redirect('/dashboard?version=pro');
  });
});

// Discord認証コールバック（デフォルト - 後方互換性）
app.get('/auth/discord/callback', (req, res, next) => {
  if (!passport._strategies['discord']) return res.redirect('/login');
  return passport.authenticate('discord', { failureRedirect: '/login' })(req, res, () => {
    res.redirect('/dashboard');
  });
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

// クライアント用：現在のセッション状態を返す（フロントがlocalStorageではなくサーバーセッションを見るため）
app.get('/api/session', (req, res) => {
  // キャッシュさせない（SW/中継キャッシュ対策）
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.json({ authenticated: true, user: req.user });
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

// Bot設定保存・取得API
app.post('/api/settings', requireAuth, express.json(), async (req, res) => {
    try {
        const userId = req.user.id;
        const guildId = req.body.guildId;
        const settings = req.body.settings;

        if (!guildId || !settings) {
            return res.status(400).json({ error: 'guildId and settings are required' });
        }

        // 設定をファイルに保存
        const settingsDir = path.join('/tmp', 'data', 'settings');
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        const settingsFile = path.join(settingsDir, `${guildId}.json`);
        const settingsData = {
            guildId,
            userId,
            settings,
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(settingsFile, JSON.stringify(settingsData, null, 2));

        // 全Botに即座に設定更新を通知
        await notifyBotsSettingsUpdate(guildId, 'settings');

        res.json({ success: true, message: '設定を保存しました' });
    } catch (error) {
        console.error('Settings save error:', error);
        res.status(500).json({ error: '設定の保存に失敗しました' });
    }
});

app.get('/api/settings/:guildId', requireAuth, (req, res) => {
    try {
        const guildId = req.params.guildId;
        const settingsFile = path.join('/tmp', 'data', 'settings', `${guildId}.json`);

        if (!fs.existsSync(settingsFile)) {
            return res.json({ settings: null });
        }

        const settingsData = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        res.json(settingsData);
    } catch (error) {
        console.error('Settings load error:', error);
        res.status(500).json({ error: '設定の読み込みに失敗しました' });
    }
});

// Bot内部アクセス用の設定読み込みAPI（認証不要）
app.get('/internal/settings/:guildId', (req, res) => {
    console.log(`[INTERNAL] Settings request for guild: ${req.params.guildId} from ${req.ip}`);
    try {
        const guildId = req.params.guildId;
        const settingsFile = path.join('/tmp', 'data', 'settings', `${guildId}.json`);

        if (!fs.existsSync(settingsFile)) {
            console.log(`[INTERNAL] Settings file not found: ${settingsFile}`);
            return res.json({ settings: null });
        }

        const settingsData = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        console.log(`[INTERNAL] Settings loaded for guild ${guildId}:`, Object.keys(settingsData));
        res.json(settingsData);
    } catch (error) {
        console.error('Settings load error:', error);
        res.status(500).json({ error: '設定の読み込みに失敗しました' });
    }
});

// Bot内部アクセス用の辞書読み込みAPI（認証不要）
app.get('/internal/dictionary/:guildId', (req, res) => {
    console.log(`[INTERNAL] Dictionary request for guild: ${req.params.guildId} from ${req.ip}`);
    try {
        const guildId = req.params.guildId;
        const dictionaryFile = path.join('/tmp', 'data', 'dictionary', `${guildId}.json`);

        if (!fs.existsSync(dictionaryFile)) {
            console.log(`[INTERNAL] Dictionary file not found: ${dictionaryFile}`);
            return res.json({ dictionary: [] });
        }

        const dictionaryData = JSON.parse(fs.readFileSync(dictionaryFile, 'utf8'));
        console.log(`[INTERNAL] Dictionary loaded for guild ${guildId}: ${dictionaryData.dictionary ? dictionaryData.dictionary.length : 0} entries`);
        res.json(dictionaryData);
    } catch (error) {
        console.error('Dictionary load error:', error);
        res.status(500).json({ error: '辞書の読み込みに失敗しました' });
    }
});

// Bot内部アクセス用のグローバル辞書取得API
// 返却フォーマット: { local: [...], global: [...] }
app.get('/internal/global-dictionary/:guildId', async (req, res) => {
  console.log(`[INTERNAL] Global dictionary request for guild: ${req.params.guildId} from ${req.ip}`);
  try {
    // 外部グローバル辞書サービスから一覧を取得する（環境変数で有効化）
    const GLOBAL_DICT_API_URL = process.env.GLOBAL_DICT_API_URL || 'https://dictapi.libertasmc.xyz';
    const GLOBAL_DICT_API_KEY = process.env.GLOBAL_DICT_API_KEY;
    let globalEntries = [];
    if (GLOBAL_DICT_API_URL && GLOBAL_DICT_API_KEY) {
      try {
        const listUrl = `${GLOBAL_DICT_API_URL.replace(/\/$/, '')}/list?per_page=200`;
        const r = await axios.get(listUrl, { headers: { 'X-API-Key': GLOBAL_DICT_API_KEY }, timeout: 7000 });
        if (r && r.data && Array.isArray(r.data.entries)) {
          globalEntries = r.data.entries;
          console.log(`[INTERNAL] Fetched ${globalEntries.length} global dictionary entries from ${GLOBAL_DICT_API_URL}`);
        } else {
          console.log('[INTERNAL] Global dictionary service returned unexpected shape, ignoring');
        }
      } catch (e) {
        console.warn('[INTERNAL] failed to fetch global dictionary:', e.message || e);
      }
    } else {
      console.log('[INTERNAL] GLOBAL_DICT_API_URL or GLOBAL_DICT_API_KEY not configured; skipping external fetch');
    }

    return res.json({ local: localEntries, global: globalEntries });
  } catch (error) {
    console.error('Global dictionary load error:', error);
    res.status(500).json({ error: 'グローバル辞書の読み込みに失敗しました' });
  }
});

// 個人設定保存・取得API
app.post('/api/personal-settings', requireAuth, express.json(), async (req, res) => {
    try {
        const userId = req.user.id;
        const guildId = req.body.guildId;
        const settings = req.body.settings;

        if (!guildId || !settings) {
            return res.status(400).json({ error: 'guildId and settings are required' });
        }

        // 個人設定をファイルに保存
        const personalDir = path.join('/tmp', 'data', 'personal');
        if (!fs.existsSync(personalDir)) {
            fs.mkdirSync(personalDir, { recursive: true });
        }

        const personalFile = path.join(personalDir, `${guildId}_${userId}.json`);
        const personalData = {
            guildId,
            userId,
            settings,
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(personalFile, JSON.stringify(personalData, null, 2));

        // 全Botに即座に設定更新を通知
        await notifyBotsSettingsUpdate(guildId, 'personal-settings');

        res.json({ success: true, message: '個人設定を保存しました' });
    } catch (error) {
        console.error('Personal settings save error:', error);
        res.status(500).json({ error: '個人設定の保存に失敗しました' });
    }
});

app.get('/api/personal-settings/:guildId', requireAuth, (req, res) => {
    try {
        const userId = req.user.id;
        const guildId = req.params.guildId;
        const personalFile = path.join('/tmp', 'data', 'personal', `${guildId}_${userId}.json`);

        if (!fs.existsSync(personalFile)) {
            return res.json({ settings: null });
        }

        const personalData = JSON.parse(fs.readFileSync(personalFile, 'utf8'));
        res.json(personalData);
    } catch (error) {
        console.error('Personal settings load error:', error);
        res.status(500).json({ error: '個人設定の読み込みに失敗しました' });
    }
});

// 辞書設定保存・取得API
app.post('/api/dictionary', requireAuth, express.json(), async (req, res) => {
    try {
        const userId = req.user.id;
        const guildId = req.body.guildId;
        const dictionary = req.body.dictionary;

        if (!guildId || !dictionary) {
            return res.status(400).json({ error: 'guildId and dictionary are required' });
        }

        // 辞書をファイルに保存
        const dictionaryDir = path.join('/tmp', 'data', 'dictionary');
        if (!fs.existsSync(dictionaryDir)) {
            fs.mkdirSync(dictionaryDir, { recursive: true });
        }

        const dictionaryFile = path.join(dictionaryDir, `${guildId}.json`);
        const dictionaryData = {
            guildId,
            userId,
            dictionary,
            lastUpdated: new Date().toISOString()
        };

        fs.writeFileSync(dictionaryFile, JSON.stringify(dictionaryData, null, 2));

        // 全Botに即座に設定更新を通知
        await notifyBotsSettingsUpdate(guildId, 'dictionary');

        res.json({ success: true, message: '辞書を保存しました' });
    } catch (error) {
        console.error('Dictionary save error:', error);
        res.status(500).json({ error: '辞書の保存に失敗しました' });
    }
});

app.get('/api/dictionary/:guildId', requireAuth, (req, res) => {
    try {
        const guildId = req.params.guildId;
        const dictionaryFile = path.join('/tmp', 'data', 'dictionary', `${guildId}.json`);

        if (!fs.existsSync(dictionaryFile)) {
            return res.json({ dictionary: [] });
        }

        const dictionaryData = JSON.parse(fs.readFileSync(dictionaryFile, 'utf8'));
        res.json(dictionaryData);
    } catch (error) {
        console.error('Dictionary load error:', error);
        res.status(500).json({ error: '辞書の読み込みに失敗しました' });
    }
});

// 全Botに設定更新を通知する関数
async function notifyBotsSettingsUpdate(guildId, settingsType) {
    const botServices = [
        'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002',
        'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3001',
        'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3001',
        'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3001',
        'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3001',
        'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3001',
        'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012'
    ];

    const notifications = botServices.map(async (botUrl) => {
        try {
            console.log(`通知送信中: ${botUrl} (Guild: ${guildId}, Type: ${settingsType})`);
            const response = await axios.post(`${botUrl}/internal/reload-settings`, {
                guildId: guildId,
                settingsType: settingsType
            }, {
                timeout: 3000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.status === 200) {
                console.log(`✓ Bot通知成功: ${botUrl}`);
            } else {
                console.warn(`⚠ Bot通知失敗: ${botUrl} (Status: ${response.status})`);
            }
        } catch (error) {
            console.warn(`⚠ Bot通知エラー: ${botUrl} - ${error.message}`);
        }
    });

    // すべての通知を並行実行（エラーがあっても続行）
    await Promise.allSettled(notifications);
    console.log(`設定更新通知完了 (Guild: ${guildId}, Type: ${settingsType})`);
}

// Patreonリンク取得ヘルパー関数
async function getPatreonLink(discordId) {
    try {
        if (!fs.existsSync(PATREON_LINKS_FILE)) return null;
        const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8') || '[]';
        const arr = JSON.parse(raw);
        return arr.find(x => String(x.discordId) === String(discordId)) || null;
    } catch (e) {
        console.error('getPatreonLink error', e);
        return null;
    }
}

// ダッシュボードルート（認証必須）
app.get('/dashboard', requireAuth, (req, res) => {
    // バージョン情報を取得
    const version = req.query.version || req.user.version || 'free';
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 追加: sitemap / robots / Google ping（末尾に追記）

const BASE_URL = process.env.BASE_URL || 'https://aivis-chan-bot.com';

// robots.txt を返す（ファイルがあればファイルを、その場で無ければデフォルトを返す）
app.get('/robots.txt', (req, res) => {
  const p = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.type('text/plain').send(
`User-agent: *
Allow: /
Sitemap: ${BASE_URL}/sitemap.xml
`
  );
});

// sitemap.xml を動的生成して返す（必要に応じて拡張）
app.get('/sitemap.xml', (req, res) => {
  const urls = [
    { loc: `${BASE_URL}/`, priority: 1.0 },
    { loc: `${BASE_URL}/bot-stats`, priority: 0.6 },
    { loc: `${BASE_URL}/bot-stats-2nd`, priority: 0.6 },
    { loc: `${BASE_URL}/bot-stats-3rd`, priority: 0.6 },
    { loc: `${BASE_URL}/bot-stats-4th`, priority: 0.6 },
    { loc: `${BASE_URL}/bot-stats-5th`, priority: 0.6 },
    { loc: `${BASE_URL}/bot-stats-6th`, priority: 0.6 },
    // 必要なら他の静的ページを追加
  ];

  const now = new Date().toISOString();
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    .concat(urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <priority>${u.priority}</priority>
  </url>`))
    .concat(['</urlset>'])
    .join('\n');

  res.type('application/xml').send(xml);
});

// Google に sitemap 更新を通知する簡易エンドポイント（実行ログを返す）
app.get('/notify-google', async (req, res) => {
  // Google の sitemaps ping は廃止されています。
  // 自動で sitemap を登録するには Search Console API を利用してください。
  // 手順:
  // 1. GCP プロジェクトでサービスアカウント作成
  // 2. Search Console のサイト所有権を確認し、サービスアカウントを Search Console に追加
  // 3. Search Console API の sites.sitemaps.submit を呼ぶ
  res.json({
    ok: false,
    message: 'Google sitemaps ping is deprecated. Use Search Console (manual) or Search Console API (sites.sitemaps.submit). See https://developers.google.com/search/docs/crawling-indexing/sitemaps/submit-sitemap',
    manual_steps: [
      'Search Console -> サイトを選択 -> サイトマップ -> https://aivis-chan-bot.com/sitemap.xml を追加',
      'または Search Console API を利用してプログラム的に登録'
    ]
  });
});

// サイト／認証設定（環境変数で指定）
const GSC_SITE_URL = process.env.GSC_SITE_URL || 'https://aivis-chan-bot.com'; // Search Console に登録されている正確なプロパティ URL
const GSC_SA_KEY_JSON = process.env.GSC_SA_KEY_JSON; // JSON文字列（推奨）またはパスを使う場合は次のロジックを変更する

async function getGscClient() {
  if (!GSC_SA_KEY_JSON) throw new Error('GSC_SA_KEY_JSON not set');
  const key = JSON.parse(GSC_SA_KEY_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  return google.webmasters({ version: 'v3', auth });
}

async function submitSitemap() {
  const client = await getGscClient();
  const sitemapUrl = `${GSC_SITE_URL.replace(/\/$/, '')}/sitemap.xml`;
  // siteUrl must exactly match property in Search Console (including https://)
  await client.sitemaps.submit({ siteUrl: GSC_SITE_URL, feedpath: sitemapUrl });
}

// エンドポイント：即時送信（手動トリガー用）
app.post('/submit-sitemap', async (req, res) => {
  try {
    await submitSitemap();
    res.json({ ok: true, message: 'sitemap submitted' });
  } catch (err) {
    console.error('submit-sitemap error', err);
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// --- Solana invoice endpoints (web handles creation & confirmation) ---
app.post('/internal/solana/create-invoice', express.json(), async (req, res) => {
  try {
    const { amountLamports, currency, mint } = req.body || {};
    if (!amountLamports || typeof amountLamports !== 'number') return res.status(400).json({ error: 'invalid-amount' });
    const allowedCurrencies = ['sol', 'spl'];
    const cur = allowedCurrencies.includes(currency) ? currency : 'sol';
    if (cur === 'spl' && (!mint || typeof mint !== 'string')) return res.status(400).json({ error: 'invalid-mint' });

    ensureSolanaInvoicesFile();
    const invoices = loadSolanaInvoices();
    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const receiver = process.env.SOLANA_RECEIVER_PUBKEY || '';
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const entry = { invoiceId, amountLamports, currency: cur, mint: cur === 'spl' ? mint : null, receiver, rpc, createdAt: new Date().toISOString(), status: 'pending' };
    invoices.push(entry);
    saveSolanaInvoices(invoices);
    return res.json({ invoiceId, receiver, rpc, currency: cur, mint: entry.mint });
  } catch (e) {
    console.error('web create-invoice error', e);
    return res.status(500).json({ error: 'create-invoice-failed' });
  }
});

// Confirm: client provides signature and invoiceId, web calls pro-premium verify and updates invoice
app.post('/internal/solana/confirm', express.json(), async (req, res) => {
  try {
    const { signature, invoiceId } = req.body || {};
    if (!signature || !invoiceId) return res.status(400).json({ error: 'invalid-params' });
    ensureSolanaInvoicesFile();
    const invoices = loadSolanaInvoices();
    const idx = invoices.findIndex(i => i.invoiceId === invoiceId);
    if (idx === -1) return res.status(404).json({ error: 'invoice-not-found' });
    const invoice = invoices[idx];
    // call pro-premium verify endpoint
    const proBase = process.env.BOT_API_URL_PRO || 'http://aivis-chan-bot-pro-premium:3012';
    try {
      const resp = await axios.post(`${proBase.replace(/\/$/, '')}/internal/solana/verify`, { signature, invoiceId, expectedLamports: invoice.amountLamports }, { timeout: 10000 });
      if (resp && resp.data && resp.data.ok) {
        invoices[idx].status = 'paid';
        invoices[idx].paidAt = new Date().toISOString();
        invoices[idx].signature = signature;
        saveSolanaInvoices(invoices);
        return res.json({ ok: true });
      } else {
        return res.status(400).json({ error: 'verification-failed', details: resp?.data || null });
      }
    } catch (e) {
      console.error('pro verify call failed', e?.response?.data || e.message || e);
      return res.status(502).json({ error: 'verify-call-failed' });
    }
  } catch (e) {
    console.error('web confirm error', e);
    return res.status(500).json({ error: 'confirm-failed' });
  }
});

// Proxy endpoint to fetch Discord guild widget JSON (avoids CORS / iframe parsing)
app.get('/api/discord-widget/:guildId', async (req, res) => {
  const guildId = req.params.guildId;
  try {
    const r = await axios.get(`https://discord.com/api/guilds/${guildId}/widget.json`, { timeout: 5000 });
    return res.json(r.data);
  } catch (err) {
    console.error('discord-widget proxy error', err?.response?.data || err.message || err);
    return res.status(502).json({ error: 'failed to fetch widget', details: err?.response?.data || err.message });
  }
});


// 任意：定期自動送信（cron式を環境変数で指定）
if (process.env.SITEMAP_SUBMIT_CRON) {
  const cron = require('node-cron');
  cron.schedule(process.env.SITEMAP_SUBMIT_CRON, async () => {
    try {
      console.log('scheduled submit-sitemap running');
      await submitSitemap();
      console.log('scheduled submit-sitemap done');
    } catch (e) {
      console.error('scheduled submit-sitemap failed', e);
    }
  }, { timezone: process.env.SITEMAP_CRON_TZ || 'UTC' });
}

app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
});

// Webhook receiver for bot-stats-server
app.post('/api/receive', express.json(), async (req, res) => {
  try {
    const body = req.body;
    console.log('[WEBHOOK] Received:', JSON.stringify(body).slice(0, 1000));

    // Basic validation
    if (!body || !body.type) {
      return res.status(400).json({ ok: false, error: 'invalid payload' });
    }

    // Store or process payload as needed. For now, write to logs and a rolling file.
  const logLine = `${new Date().toISOString()} ${req.ip} ${body.type} ${JSON.stringify(body.payload).slice(0,1000)}\n`;
  // Use writable location by default; allow override via WEBHOOK_LOG_PATH
  const logPath = process.env.WEBHOOK_LOG_PATH || '/tmp/webhook-receive.log';
  fs.appendFile(logPath, logLine, (err) => { if (err) console.error('Failed to write webhook log', err); });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Webhook handler error', err);
    return res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// --- Patreon OAuth endpoints
const PATREON_CLIENT_ID = process.env.PATREON_CLIENT_ID || '';
const PATREON_CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET || '';
const PATREON_REDIRECT_PATH = '/auth/patreon/callback';
const PATREON_REDIRECT_URI = `${BASE_URL.replace(/\/$/, '')}${PATREON_REDIRECT_PATH}`;
const os = require('os');
// store patreon links in a writable folder. Prefer explicit DATA_DIR env, otherwise use system tmpdir.
const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'aivis-data');
const PATREON_LINKS_FILE = path.join(DATA_DIR, 'patreon_links.json');
// A simple JSONL logfile for callback debug (do NOT store secrets here)
const PATREON_CALLBACK_LOG = path.join(DATA_DIR, 'patreon_callbacks.log');
const SOLANA_INVOICES_FILE = path.join(DATA_DIR, 'solana_invoices.json');

function ensurePatreonLinksFile() {
  try {
    const dir = path.dirname(PATREON_LINKS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(PATREON_LINKS_FILE)) {
      fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify([]));
    }
  } catch (e) { console.error('ensurePatreonLinksFile error', e); }
}

function ensureSolanaInvoicesFile() {
  try {
    const dir = path.dirname(SOLANA_INVOICES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(SOLANA_INVOICES_FILE)) {
      fs.writeFileSync(SOLANA_INVOICES_FILE, JSON.stringify([]));
    }
  } catch (e) { console.error('ensureSolanaInvoicesFile error', e); }
}

function loadSolanaInvoices() {
  try {
    ensureSolanaInvoicesFile();
    const raw = fs.readFileSync(SOLANA_INVOICES_FILE, 'utf8') || '[]';
    return JSON.parse(raw);
  } catch (e) { console.error('loadSolanaInvoices error', e); return []; }
}

function saveSolanaInvoices(arr) {
  try {
    ensureSolanaInvoicesFile();
    fs.writeFileSync(SOLANA_INVOICES_FILE, JSON.stringify(arr, null, 2));
    return true;
  } catch (e) { console.error('saveSolanaInvoices error', e); return false; }
}

function appendPatreonCallbackLog(obj) {
  try {
    // ensure directory exists
    const dir = path.dirname(PATREON_CALLBACK_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Prepare a safe object: strip or mask potentially sensitive fields
    const safe = Object.assign({}, obj);
    if (safe.tokenData) {
      // Do not persist access/refresh tokens; keep only non-sensitive metadata
      safe.tokenData = {
        hasAccessToken: !!safe.tokenData.access_token,
        expires_in: safe.tokenData.expires_in || null
      };
    }
    fs.appendFileSync(PATREON_CALLBACK_LOG, JSON.stringify(safe) + '\n');
  } catch (e) {
    console.error('appendPatreonCallbackLog error', e);
  }
}

// run migration once at startup
try {
  ensurePatreonLinksFile();
  migratePatreonLinks();
} catch (e) { console.error('[PATREON] startup migration error', e); }

function savePatreonLink(link) {
  try {
    ensurePatreonLinksFile();
    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8');
    const arr = JSON.parse(raw || '[]');
    // Normalize incoming discordId: if the incoming value is a base64-encoded JSON
    // like {"discordId":"12345"} decode it and store the plain id. Also
    // ensure createdAt is set to server time to avoid trusting client timestamps.
    const incoming = Object.assign({}, link);
    // Normalize incoming.discordId so we never persist a base64-encoded value
    const storedVal = String(incoming.discordId || '');
    let decoded = tryDecodeBase64Json(storedVal);
    if (decoded) {
      // keep original encoded value for audit
      incoming.originalState = incoming.originalState || storedVal;
      incoming.discordId = decoded;
    } else {
      // If value looks like "<left>:<rand>", try decode left-part too (legacy state format)
      if (storedVal && storedVal.includes(':')) {
        const left = storedVal.split(':', 1)[0];
        const leftDecoded = tryDecodeBase64Json(left);
        if (leftDecoded) {
          incoming.originalState = incoming.originalState || left;
          incoming.discordId = leftDecoded;
        } else if (/^\d{5,22}$/.test(left)) {
          // plain numeric left-side
          incoming.discordId = left;
        }
      }
      // If it's already a plain numeric id, leave it as-is
      if (!incoming.discordId && /^\d{5,22}$/.test(storedVal)) {
        incoming.discordId = storedVal;
      }
    }

    // Use server time for createdAt to avoid stale client timestamps
    incoming.createdAt = new Date().toISOString();

    // If an entry for this discordId already exists, update it instead of
    // appending a duplicate. Preserve other fields where appropriate.
    const idx = arr.findIndex(x => String(x.discordId) === String(incoming.discordId));
    if (idx !== -1) {
      // Merge: overwrite tokenData and patreonId, but preserve older originalState
      const existing = arr[idx] || {};
      const merged = Object.assign({}, existing, incoming);
      if (!merged.originalState && existing.originalState) merged.originalState = existing.originalState;
      arr[idx] = merged;
    } else {
      arr.push(incoming);
    }

    fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.error('savePatreonLink error', e); }
}

// Migration: ensure stored patreon links include plain discordId values
function tryDecodeBase64Json(s) {
  try {
    const buf = Buffer.from(String(s), 'base64');
    const txt = buf.toString('utf8');
    if (!txt) return null;
    // If decoded text is likely JSON (object, array or quoted string), parse it.
    const trimmed = String(txt).trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(txt);
        if (parsed && typeof parsed === 'object' && parsed.discordId) return String(parsed.discordId);
        if (typeof parsed === 'number' || typeof parsed === 'string') {
          const plain = String(parsed).trim();
          if (/^\d{5,22}$/.test(plain)) return plain;
        }
        return null;
      } catch (e) {
        // fall through to plain handling
      }
    }
    // Not JSON-like: treat decoded text as plain string and check for numeric discordId
    const plain = trimmed;
    if (/^\d{5,22}$/.test(plain)) return plain; // plausible discord id length
    return null;
  } catch (e) {
    return null;
  }
}

function migratePatreonLinks() {
  try {
    if (!fs.existsSync(PATREON_LINKS_FILE)) return;
    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8') || '[]';
    const arr = JSON.parse(raw);
    let changed = false;
    const toRemove = new Set();

    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      const stored = String(entry.discordId || '');
      const decoded = tryDecodeBase64Json(stored);
      if (decoded && stored !== decoded) {
        // If there's already an entry with the plain id, mark this one for removal to avoid duplicates
        const existsPlainIndex = arr.findIndex(x => String(x.discordId) === decoded);
        if (existsPlainIndex === -1) {
          // keep token data but set discordId to decoded plain id and store original state
          entry.originalState = stored;
          entry.discordId = decoded;
          changed = true;
        } else {
          // prefer the existing plain entry; if not identical, preserve createdAt if earlier
          toRemove.add(i);
          changed = true;
        }
      }
    }

    if (toRemove.size > 0) {
      // remove in reverse order
      const indices = Array.from(toRemove).sort((a,b) => b - a);
      for (const idx of indices) arr.splice(idx, 1);
    }

    if (changed) {
      // backup original
      const bak = PATREON_LINKS_FILE + '.bak.' + Date.now();
      try { fs.copyFileSync(PATREON_LINKS_FILE, bak); console.log('[PATREON] backup saved to', bak); } catch (e) { console.warn('[PATREON] failed to save backup', e); }
      fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify(arr, null, 2));
      console.log('[PATREON] migrated patreon_links.json - plain discordId fields ensured');
    } else {
      console.log('[PATREON] no migration needed for patreon_links.json');
    }
  } catch (e) {
    console.error('[PATREON] migratePatreonLinks error', e);
  }
}

// API: return saved patreon link for a given discordId (used by bots to synchronize)
app.get('/api/patreon/link/:discordId', (req, res) => {
  try {
    const discordId = req.params.discordId;
    if (!fs.existsSync(PATREON_LINKS_FILE)) return res.status(404).json({ linked: false });
    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8') || '[]';
    const arr = JSON.parse(raw);
    // direct match
    let found = arr.find(x => String(x.discordId) === String(discordId));
    // reuse global tryDecodeBase64Json which now also handles plain base64-encoded numeric IDs
    const tryDecodeBase64JsonLocal = tryDecodeBase64Json;

    if (!found) {
      // if stored entries contain base64-encoded states, decode them and compare
      for (const entry of arr) {
        const stored = String(entry.discordId || '');
        const decoded = tryDecodeBase64Json(stored);
        if (decoded && decoded === String(discordId)) {
          found = entry;
          break;
        }
      }
    }

    if (!found) {
      // also try if the requested discordId is itself base64-encoded JSON that refers to a numeric id
      const reqDecoded = tryDecodeBase64Json(discordId);
      if (reqDecoded) {
        found = arr.find(x => String(x.discordId) === String(reqDecoded));
        if (!found) {
          for (const entry of arr) {
            const stored = String(entry.discordId || '');
            const decoded = tryDecodeBase64Json(stored);
            if (decoded && decoded === reqDecoded) {
              found = entry;
              break;
            }
          }
        }
      }
    }

    if (!found) return res.status(404).json({ linked: false });
    return res.json(Object.assign({ linked: true }, found));
  } catch (e) {
    console.error('get patreon link error', e);
    return res.status(500).json({ linked: false, error: String(e?.message || e) });
  }
});

app.get('/auth/patreon/start', (req, res) => {
  const discordId = req.query.discordId;
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET) return res.status(500).send('Patreon client not configured');
  if (!discordId) return res.status(400).send('discordId is required as query param');
  const state = `${discordId}:${Math.random().toString(36).slice(2,10)}`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: PATREON_CLIENT_ID,
    redirect_uri: PATREON_REDIRECT_URI,
    scope: 'identity',
    state
  });
  const authUrl = `https://www.patreon.com/oauth2/authorize?${params.toString()}`;
  // Debug: log the generated Patreon authorization URL so we can verify the redirect_uri being used
  console.log('[PATREON] authUrl=', authUrl);
  return res.redirect(authUrl);
});

app.get(PATREON_REDIRECT_PATH, async (req, res) => {
  const { code, state } = req.query;
  // Log basic arrival information (mask code)
  try {
    appendPatreonCallbackLog({ ts: new Date().toISOString(), ip: req.ip, ua: req.headers['user-agent'], event: 'callback_received', code: code ? ('***' + String(code).slice(-4)) : null, state: state || null });
  } catch (e) { /* non-fatal */ }

  if (!code || !state) {
    appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_missing_params', state: state || null });
    return res.status(400).send('missing code or state');
  }
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET) {
    appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_not_configured' });
    return res.status(500).send('Patreon client not configured');
  }

  // exchange code for token
  try {
    const tokenResp = await axios.post('https://www.patreon.com/api/oauth2/token', new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET,
      redirect_uri: PATREON_REDIRECT_URI
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const tokenData = tokenResp.data;
    // get patreon identity
    const meResp = await axios.get('https://www.patreon.com/api/oauth2/v2/identity', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const patreonId = meResp.data?.data?.id || null;

    // save link: state may be one of:
    // - plain: "<discordId>:<rand>"
    // - legacy: "<base64-or-plain-left>:<rand>"
    // - base64 JSON: base64(JSON.stringify({ discordId, guildId }))
    // Normalize aggressively so we never persist base64 values.
    let discordId = null;
    let guildId = undefined;

    // 1) Try base64 JSON decode (most explicit form)
    try {
      const txt = Buffer.from(String(state), 'base64').toString('utf8');
      const parsed = JSON.parse(txt);
      if (parsed && parsed.discordId) {
        discordId = String(parsed.discordId);
        if (parsed.guildId) guildId = String(parsed.guildId);
      }
    } catch (e) {
      // not base64-json, fall through
    }

    // 2) If not decoded yet, handle colon-delimited forms
    if (!discordId && String(state).includes(':')) {
      const left = String(state).split(':', 1)[0];
      // left might be plain numeric, base64 numeric, or base64 JSON (rare)
      // try our helper which decodes base64 JSON or plain-base64 numeric IDs
      const tryDecoded = tryDecodeBase64Json(left);
      if (tryDecoded) {
        discordId = tryDecoded;
      } else if (/^\d{5,22}$/.test(left)) {
        discordId = left;
      }
    }

    // 3) If still not found, maybe state is directly base64-encoded numeric or plain numeric
    if (!discordId) {
      const directDecoded = tryDecodeBase64Json(state);
      if (directDecoded) discordId = directDecoded;
      else if (/^\d{5,22}$/.test(String(state))) discordId = String(state);
    }

    // Save the link and persist; ensure discordId is string or null
    savePatreonLink({ discordId: discordId || '', patreonId, tokenData, guildId, createdAt: new Date().toISOString() });

    // record success (do not include tokens)
    appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_success', discordId: String(discordId), patreonId: patreonId || null });

    // Redirect to a static success page and include minimal data
    const successPath = `/auth/patreon/success.html?discordId=${encodeURIComponent(discordId)}&patreonId=${encodeURIComponent(patreonId || '')}&ts=${Date.now()}`;
    return res.redirect(successPath);
  } catch (e) {
    // Log error details safely
    const errBody = e?.response?.data ? (typeof e.response.data === 'string' ? e.response.data.slice(0,1000) : JSON.stringify(e.response.data).slice(0,1000)) : (e.message || String(e));
    console.error('Patreon callback error', errBody);
    appendPatreonCallbackLog({ ts: new Date().toISOString(), event: 'callback_error', error: errBody, state: state || null });
    return res.status(500).send('Failed to exchange token');
  }
});

// サーバーリストを返すエンドポイント
app.get('/api/servers', async (req, res) => {
  try {
    // Allow anonymous access: if not authenticated, treat as empty guild list
    let userGuilds = [];
    const isAuth = req.isAuthenticated && req.isAuthenticated();
    if (isAuth) {
      userGuilds = req.user && Array.isArray(req.user.guilds) ? req.user.guilds : [];
    }

    console.log(`[DEBUG] Authenticated: ${isAuth}`);
    console.log(`[DEBUG] User guilds count: ${userGuilds.length}`);
    console.log(`[DEBUG] User guilds:`, userGuilds.map(g => ({ id: g.id, name: g.name })));
        console.log(`[DEBUG] User guilds count: ${userGuilds.length}`);
        console.log(`[DEBUG] User guilds:`, userGuilds.map(g => ({ id: g.id, name: g.name })));
        
        // Botが参加しているギルドIDを取得
        const botGuildIds = new Set();
        const BOTS = [
            { name: '1st', baseUrl: 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002' },
            { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003' },
            { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004' },
            { name: '4th', baseUrl: 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005' },
            { name: '5th', baseUrl: 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006' },
            { name: '6th', baseUrl: 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007' },
            { name: 'pro-premium', baseUrl: 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012' }
        ];

        // 各Botインスタンスからギルド情報を取得
        const botInfoPromises = BOTS.map(async (bot) => {
            try {
                console.log(`[DEBUG] Fetching info from ${bot.name} at ${bot.baseUrl}`);
                const response = await axios.get(`${bot.baseUrl}/internal/info`, {
                    timeout: 5000
                });
                console.log(`[DEBUG] ${bot.name} response:`, response.data);
                return { bot: bot.name, guildIds: response.data.guildIds || [] };
            } catch (error) {
                console.warn(`[DEBUG] Failed to fetch info from ${bot.name}:`, error.message);
                return { bot: bot.name, guildIds: [] };
            }
        });

        const botResults = await Promise.all(botInfoPromises);
        console.log(`[DEBUG] Bot results:`, botResults);
        
        // 全BotインスタンスのギルドIDを統合
        botResults.forEach(result => {
            result.guildIds.forEach(guildId => botGuildIds.add(guildId));
        });

        console.log(`[DEBUG] Bot guild IDs:`, Array.from(botGuildIds));

        // ユーザーのギルドの中で、Botが参加しているもののみをフィルタリング
        const filteredServers = userGuilds.filter(guild => botGuildIds.has(guild.id));
        console.log(`[DEBUG] Filtered servers count: ${filteredServers.length}`);
        console.log(`[DEBUG] Filtered servers:`, filteredServers.map(g => ({ id: g.id, name: g.name })));
        
        // デバッグモード: フィルタリングせずにすべてのユーザーギルドを返す（一時的）
        const DEBUG_MODE = process.env.DEBUG_SERVERS === 'true';
        const finalServers = DEBUG_MODE ? userGuilds : filteredServers;
        console.log(`[DEBUG] Debug mode: ${DEBUG_MODE}, Final servers count: ${finalServers.length}`);
        
    // サーバーの iconUrl を正規化する（可能なら CDN の URL を組み立てる）
    const normalizedServers = finalServers.map(s => {
      // s may already contain iconUrl, or may include an 'icon' hash from Discord
      let iconUrl = s.iconUrl || null;
      if (!iconUrl) {
        const iconHash = s.icon || s.iconHash || null;
        if (iconHash) {
          iconUrl = `https://cdn.discordapp.com/icons/${s.id}/${iconHash}.png`;
        }
      }
      return Object.assign({}, s, { iconUrl });
    });

    // ユーザー情報を各サーバーに追加
    const serversWithUserInfo = normalizedServers.map(server => ({
      ...server,
      nickname: req.user && req.user.nickname ? req.user.nickname : req.user && req.user.username ? req.user.username : null,
      userIconUrl: req.user && req.user.avatarUrl ? req.user.avatarUrl : (req.user && req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : null)
    }));

        res.json(serversWithUserInfo);
    } catch (error) {
        console.error('Failed to fetch servers:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Discord OAuth2を使用してユーザーに関連するサーバーリストを取得する関数
async function fetchServersForUser(accessToken) {
    try {
        // Discord APIを使用してユーザーのサーバーリストを取得
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (guildsResponse.status !== 200) {
            throw new Error(`Failed to fetch servers: ${guildsResponse.statusText}`);
        }

        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (userResponse.status !== 200) {
            throw new Error(`Failed to fetch user info: ${userResponse.statusText}`);
        }

        const userIconUrl = userResponse.data.avatar
            ? `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.png`
            : null;

        const userNickname = userResponse.data.username;

        return guildsResponse.data.map(guild => ({
            id: guild.id,
            name: guild.name,
            iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
            nickname: userNickname, // ユーザーニックネームを追加
            userIconUrl // ユーザーアイコンを追加
        }));
    } catch (error) {
        console.error('Error fetching servers for user:', error);
        throw new Error('Failed to fetch servers');
    }
}

// TTS エンジンの話者一覧をプロキシするエンドポイント
// フロントは CORS やネットワーク制約を避けるためこのエンドポイントを優先して叩きます
app.get('/api/tts/speakers', async (req, res) => {
  const ttsBase = process.env.TTS_ENGINE_URL || process.env.AIVIS_TTS_URL || 'http://localhost:10101';
  const url = `${String(ttsBase).replace(/\/$/, '')}/speakers`;
  try {
    const r = await axios.get(url, { timeout: 5000 });
    if (r && r.data) {
      // 期待は配列（文字列またはオブジェクト）
      return res.json(r.data);
    }
    return res.json([]);
  } catch (e) {
    console.warn('[api/tts/speakers] fetch failed:', e.message || e);
    return res.status(502).json({ error: 'Failed to fetch speakers from TTS engine' });
  }
});

// ギルドのチャンネル一覧を返す（最良努力）
// 実装方針:
// 1) req.user.guilds に channels 情報が含まれていればそれを返す
// 2) 各 Bot インスタンスの内部 API に /internal/guilds/:guildId/channels を問い合わせ
// 3) Discord widget を使って最低限の情報を取得
// 認証必須（requireAuth）
app.get('/api/guilds/:guildId/channels', requireAuth, async (req, res) => {
  const guildId = req.params.guildId;
  try {
    // 1) req.user.guilds に channels 情報があるか確認
    if (req.user && Array.isArray(req.user.guilds)) {
      const g = req.user.guilds.find(x => String(x.id) === String(guildId));
      if (g && Array.isArray(g.channels) && g.channels.length > 0) {
        return res.json(g.channels);
      }
    }

    // 2) Bot インスタンスに問い合わせ（同じ BOTS 配列形式を使用）
    const BOTS = [
      { name: '1st', baseUrl: 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002' },
      { name: '2nd', baseUrl: 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003' },
      { name: '3rd', baseUrl: 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004' },
      { name: '4th', baseUrl: 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005' },
      { name: '5th', baseUrl: 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006' },
      { name: '6th', baseUrl: 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007' },
      { name: 'pro-premium', baseUrl: 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012' }
    ];

    for (const bot of BOTS) {
      try {
        const r = await axios.get(`${bot.baseUrl}/internal/guilds/${guildId}/channels`, { timeout: 3000 });
        if (r && Array.isArray(r.data) && r.data.length > 0) {
          return res.json(r.data);
        }
      } catch (e) {
        // ignore and try next
        console.debug(`[api/guilds/${guildId}/channels] bot ${bot.name} failed:`, e.message || e);
      }
    }

    // 3) Discord widget fallback
    try {
      const widget = await axios.get(`https://discord.com/api/guilds/${guildId}/widget.json`, { timeout: 3000 });
      if (widget && widget.data) {
        // widget.channels might exist; map to simple shape
        const chs = (widget.data.channels || []).map(c => ({ id: c.id, name: c.name, type: c.type || null }));
        if (chs.length > 0) return res.json(chs);
      }
    } catch (e) {
      console.debug(`[api/guilds/${guildId}/channels] discord widget failed:`, e.message || e);
    }

    // 最終フォールバック: 空配列
    return res.json([]);
  } catch (error) {
    console.error(`[api/guilds/${guildId}/channels] error:`, error);
    return res.status(500).json({ error: 'Failed to fetch guild channels' });
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
