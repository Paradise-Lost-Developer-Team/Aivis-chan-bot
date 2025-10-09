const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { google } = require('googleapis');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// 環境変数の検証
function validateEnvVars() {
  // 必須環境変数: SESSION_SECRET と Free版のDiscord認証情報
  const required = ['SESSION_SECRET', 'DISCORD_CLIENT_ID_FREE', 'DISCORD_CLIENT_SECRET_FREE'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`[ENV] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  if (process.env.SESSION_SECRET === 'your-secret-key-change-this') {
    console.error('[ENV] SESSION_SECRET must be changed from default value');
    process.exit(1);
  }

  // Pro版の設定確認（警告のみ）
  if (!process.env.DISCORD_CLIENT_ID_PRO || !process.env.DISCORD_CLIENT_SECRET_PRO) {
    console.warn('[ENV] Pro version Discord OAuth2 credentials not configured');
    console.warn('[ENV] Pro version login will be disabled');
  }

  console.log('[ENV] Environment variables validated successfully');
  console.log(`[ENV] Free version: ${process.env.DISCORD_CLIENT_ID_FREE ? 'Configured' : 'Missing'}`);
  console.log(`[ENV] Pro version: ${process.env.DISCORD_CLIENT_ID_PRO ? 'Configured' : 'Missing'}`);
}

validateEnvVars();

// 定数定義
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';
const BASE_URL = process.env.BASE_URL || 'https://aivis-chan-bot.com';

// DATA_DIRを永続化ディレクトリに変更
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const PATREON_LINKS_FILE = path.join(DATA_DIR, 'patreon_links.json');
const PATREON_CALLBACK_LOG = path.join(DATA_DIR, 'patreon_callbacks.log');
const SOLANA_INVOICES_FILE = path.join(DATA_DIR, 'solana_invoices.json');

const AXIOS_TIMEOUT = parseInt(process.env.AXIOS_TIMEOUT || '5000', 10);
const AXIOS_SHORT_TIMEOUT = parseInt(process.env.AXIOS_SHORT_TIMEOUT || '3000', 10);

// Redis セッションストア設定
let redisStoreInstance = null;
let sessionStoreType = 'memory';

async function setupRedisStore() {
  if (process.env.SESSION_STORE !== 'redis') {
    console.log('[SESSION] Using memory store (not suitable for production)');
    return;
  }

  try {
    const RedisStore = require('connect-redis').default;
    const redis = require('redis');
    
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[REDIS] Max reconnect attempts exceeded');
            return new Error('Redis reconnect attempts exceeded');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('[REDIS] Client Error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[REDIS] Client Connected');
    });

    redisClient.on('ready', () => {
      console.log('[REDIS] Client Ready');
    });

    await redisClient.connect();

    redisStoreInstance = new RedisStore({
      client: redisClient,
      prefix: 'aivis:sess:',
      ttl: 24 * 60 * 60
    });
    
    sessionStoreType = 'redis';
    console.log('[SESSION] Using Redis session store');
  } catch (err) {
    console.error('[SESSION] Failed to setup Redis store:', err.message);
    console.log('[SESSION] Falling back to memory store');
    redisStoreInstance = null;
    sessionStoreType = 'memory';
  }
}

const app = express();

// Discord OAuth2設定
const DISCORD_CONFIG_FREE = {
  clientId: process.env.DISCORD_CLIENT_ID_FREE || process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_FREE || process.env.DISCORD_CLIENT_SECRET,
  redirectUri: `${BASE_URL}/auth/discord/callback/free`,
  version: 'free'
};

const DISCORD_CONFIG_PRO = {
  clientId: process.env.DISCORD_CLIENT_ID_PRO,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_PRO,
  redirectUri: `${BASE_URL}/auth/discord/callback/pro`,
  version: 'pro'
};

// Bot インスタンスの定義
const BOT_INSTANCES = [
  { name: '1st', url: process.env.BOT_1ST_URL || 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002' },
  { name: '2nd', url: process.env.BOT_2ND_URL || 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003' },
  { name: '3rd', url: process.env.BOT_3RD_URL || 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004' },
  { name: '4th', url: process.env.BOT_4TH_URL || 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005' },
  { name: '5th', url: process.env.BOT_5TH_URL || 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006' },
  { name: '6th', url: process.env.BOT_6TH_URL || 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007' },
  { name: 'pro-premium', url: process.env.BOT_PRO_URL || 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012' }
];

// AivisSpeech エンジンのベースURL
const AIVISSPEECH_URL = process.env.AIVISSPEECH_URL || process.env.TTS_ENGINE_URL || 'http://aivisspeech-engine.aivis-chan-bot.svc.cluster.local:10101';

// Helper functions for data persistence
function ensureDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o777 });
      console.log(`[FS] Created directory: ${dirPath}`);
    }
    return true;
  } catch (err) {
    console.error(`[FS] Failed to create directory ${dirPath}:`, err.message);
    return false;
  }
}

function ensureFile(filePath, defaultContent = '[]') {
  try {
    ensureDirectory(path.dirname(filePath));
    
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, defaultContent, { mode: 0o666 });
      console.log(`[FS] Created file: ${filePath}`);
    }
    return true;
  } catch (err) {
    console.error(`[FS] Failed to create file ${filePath}:`, err.message);
    return false;
  }
}

function readJsonFile(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || JSON.stringify(defaultValue));
  } catch (err) {
    console.error(`[FS] Failed to read ${filePath}:`, err.message);
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  try {
    ensureFile(filePath, '[]');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o666 });
    return true;
  } catch (err) {
    console.error(`[FS] Failed to write ${filePath}:`, err.message);
    return false;
  }
}

function ensurePatreonLinksFile() {
  return ensureFile(PATREON_LINKS_FILE, '[]');
}

function isValidDiscordId(id) {
  return typeof id === 'string' && /^\d{5,22}$/.test(id);
}

function tryDecodeBase64Json(s) {
  if (!s || typeof s !== 'string') return null;
  
  try {
    const buf = Buffer.from(s, 'base64');
    const txt = buf.toString('utf8');
    
    if (!txt) return null;
    
    const trimmed = txt.trim();
    
    // JSONとして解析を試みる
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
      try {
        const parsed = JSON.parse(txt);
        
        if (parsed && typeof parsed === 'object' && parsed.discordId) {
          const id = String(parsed.discordId);
          return isValidDiscordId(id) ? id : null;
        }
        
        const plainId = String(parsed).trim();
        return isValidDiscordId(plainId) ? plainId : null;
      } catch {
        // JSONパース失敗 - プレーンテキストとして扱う
      }
    }
    
    // プレーンテキストとして検証
    return isValidDiscordId(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

function migratePatreonLinks() {
  try {
    if (!fs.existsSync(PATREON_LINKS_FILE)) {
      console.log('[PATREON] No existing links file to migrate');
      return;
    }

    const arr = readJsonFile(PATREON_LINKS_FILE, []);
    let changed = false;
    const indicesToRemove = new Set();

    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (!entry || !entry.discordId) continue;
      
      const stored = String(entry.discordId);
      
      // すでに有効なIDの場合はスキップ
      if (isValidDiscordId(stored)) continue;
      
      const decoded = tryDecodeBase64Json(stored);
      
      if (decoded && stored !== decoded) {
        // 重複チェック
        const existsPlainIndex = arr.findIndex(x => String(x.discordId) === decoded);
        
        if (existsPlainIndex === -1) {
          entry.originalState = stored;
          entry.discordId = decoded;
          changed = true;
        } else {
          indicesToRemove.add(i);
          changed = true;
        }
      }
    }

    // 重複エントリを削除
    if (indicesToRemove.size > 0) {
      const indices = Array.from(indicesToRemove).sort((a, b) => b - a);
      for (const idx of indices) {
        arr.splice(idx, 1);
      }
    }

    if (changed) {
      // バックアップ作成
      const backupPath = `${PATREON_LINKS_FILE}.bak.${Date.now()}`;
      try {
        fs.copyFileSync(PATREON_LINKS_FILE, backupPath);
        console.log(`[PATREON] Backup saved to ${backupPath}`);
      } catch (err) {
        console.warn('[PATREON] Failed to save backup:', err.message);
      }
      
      writeJsonFile(PATREON_LINKS_FILE, arr);
      console.log('[PATREON] Migration completed - plain discordId fields ensured');
    } else {
      console.log('[PATREON] No migration needed');
    }
  } catch (err) {
    console.error('[PATREON] Migration error:', err.message);
  }
}

function savePatreonLink(link) {
  try {
    ensurePatreonLinksFile();
    
    const arr = readJsonFile(PATREON_LINKS_FILE, []);
    const incoming = { ...link };
    
    // discordIdの正規化
    const storedVal = String(incoming.discordId || '');
    let decoded = tryDecodeBase64Json(storedVal);

    if (decoded) {
      incoming.originalState = incoming.originalState || storedVal;
      incoming.discordId = decoded;
    } else if (storedVal.includes(':')) {
      const left = storedVal.split(':', 1)[0];
      const leftDecoded = tryDecodeBase64Json(left);
      
      if (leftDecoded) {
        incoming.originalState = incoming.originalState || left;
        incoming.discordId = leftDecoded;
      } else if (isValidDiscordId(left)) {
        incoming.discordId = left;
      }
    } else if (isValidDiscordId(storedVal)) {
      incoming.discordId = storedVal;
    }

    if (!incoming.discordId) {
      console.error('[PATREON] Invalid discordId, cannot save link');
      return false;
    }

    incoming.createdAt = new Date().toISOString();

    // 既存エントリの更新または新規追加
    const idx = arr.findIndex(x => String(x.discordId) === String(incoming.discordId));
    
    if (idx !== -1) {
      const existing = arr[idx];
      arr[idx] = {
        ...existing,
        ...incoming,
        originalState: incoming.originalState || existing.originalState
      };
    } else {
      arr.push(incoming);
    }

    const success = writeJsonFile(PATREON_LINKS_FILE, arr);
    
    if (success) {
      console.log(`[PATREON] Saved link for discordId: ${incoming.discordId}`);
    }
    
    return success;
  } catch (err) {
    console.error('[PATREON] Save link error:', err.message);
    return false;
  }
}

function appendPatreonCallbackLog(data) {
  try {
    ensureDirectory(path.dirname(PATREON_CALLBACK_LOG));
    const logLine = JSON.stringify(data) + '\n';
    fs.appendFileSync(PATREON_CALLBACK_LOG, logLine);
  } catch (err) {
    console.error('[PATREON] Callback log error:', err.message);
  }
}

async function getPatreonLink(discordId) {
  try {
    if (!discordId || !isValidDiscordId(String(discordId))) {
      return null;
    }
    
    const arr = readJsonFile(PATREON_LINKS_FILE, []);
    return arr.find(x => String(x.discordId) === String(discordId)) || null;
  } catch (err) {
    console.error('[PATREON] Get link error:', err.message);
    return null;
  }
}

// ギルドが所属するBotインスタンスを検索（キャッシュ付き）
const guildBotCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分

async function findBotForGuild(guildId) {
  if (!guildId) {
    console.warn('[findBotForGuild] Invalid guildId provided');
    return null;
  }

  // キャッシュチェック
  const cached = guildBotCache.get(guildId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.debug(`[findBotForGuild] Cache hit for guild ${guildId}: ${cached.bot.name}`);
    return cached.bot;
  }

  // 並列検索で高速化
  const checks = BOT_INSTANCES.map(async (bot) => {
    try {
      const response = await axios.get(`${bot.url}/internal/guilds/${guildId}`, {
        timeout: AXIOS_SHORT_TIMEOUT,
        validateStatus: (status) => status === 200
      });

      if (response.data) {
        return bot;
      }
      return null;
    } catch (error) {
      if (error.response?.status !== 404) {
        console.debug(`[findBotForGuild] Error checking bot ${bot.name}:`, error.message);
      }
      return null;
    }
  });

  const results = await Promise.allSettled(checks);
  const foundBot = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)[0];

  if (foundBot) {
    console.log(`[findBotForGuild] Guild ${guildId} found in bot: ${foundBot.name}`);
    
    // キャッシュに保存
    guildBotCache.set(guildId, {
      bot: foundBot,
      timestamp: Date.now()
    });
    
    return foundBot;
  }

  console.warn(`[findBotForGuild] Guild ${guildId} not found in any bot instance`);
  return null;
}

// キャッシュクリーンアップ
setInterval(() => {
  const now = Date.now();
  for (const [guildId, cached] of guildBotCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL) {
      guildBotCache.delete(guildId);
    }
  }
}, CACHE_TTL);

// SEO: サイトマップ送信
async function submitSitemap() {
  try {
    const sitemapUrl = `${BASE_URL}/sitemap.xml`;
    console.log(`[SITEMAP] Submitting sitemap: ${sitemapUrl}`);

    // Google Search Console への送信
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/webmasters']
      });

      const webmasters = google.webmasters({ version: 'v3', auth });

      await webmasters.sitemaps.submit({
        siteUrl: BASE_URL,
        feedpath: sitemapUrl
      });

      console.log('[SITEMAP] Successfully submitted to Google Search Console');
      return true;
    } else {
      console.log('[SITEMAP] GOOGLE_APPLICATION_CREDENTIALS not set, skipping submission');
      return false;
    }
  } catch (error) {
    console.error('[SITEMAP] Submission failed:', error.message);
    return false;
  }
}

// 起動時の初期化
async function initialize() {
  try {
    await setupRedisStore();
    ensurePatreonLinksFile();
    migratePatreonLinks();
    console.log('[INIT] Initialization completed');
  } catch (err) {
    console.error('[INIT] Initialization error:', err.message);
    // 致命的なエラーではないため続行
  }
}

// Passport configuration - Free版
passport.use('discord-free', new DiscordStrategy({
  clientID: DISCORD_CONFIG_FREE.clientId,
  clientSecret: DISCORD_CONFIG_FREE.clientSecret,
  callbackURL: DISCORD_CONFIG_FREE.redirectUri,
  scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
  profile.version = 'free';
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// Passport configuration - Pro版
if (DISCORD_CONFIG_PRO.clientId && DISCORD_CONFIG_PRO.clientSecret) {
  passport.use('discord-pro', new DiscordStrategy({
    clientID: DISCORD_CONFIG_PRO.clientId,
    clientSecret: DISCORD_CONFIG_PRO.clientSecret,
    callbackURL: DISCORD_CONFIG_PRO.redirectUri,
    scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
    profile.version = 'pro';
    profile.accessToken = accessToken;
    return done(null, profile);
  }));
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Middleware
app.set('trust proxy', 1);

const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  },
  name: 'aivis.sid'
};

// セッションストアを確実に設定
if (redisStoreInstance) {
  sessionConfig.store = redisStoreInstance;
  console.log('[SESSION] Session config using Redis store');
} else {
  console.log('[SESSION] Session config using memory store');
}

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));
app.use(express.json({ limit: '1mb' }));

// Request logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[REQ] ${timestamp} ${method} ${url} IP:${ip}`);
  next();
});

// SEO: noindex for dashboard
app.use((req, res, next) => {
  const url = req.url || req.path || '';
  
  if (url === '/dashboard' || url.startsWith('/dashboard')) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }
  
  next();
});

// エラーハンドラー関数
function sendErrorResponse(res, statusCode, message, details = null) {
  const response = { error: message };
  
  if (details && process.env.NODE_ENV !== 'production') {
    response.details = details;
  }
  
  res.status(statusCode).json(response);
}

// 認証ミドルウェア - API用
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  sendErrorResponse(res, 401, 'Unauthorized');
}

// 認証ミドルウェア - HTMLページ用
function requireAuthPage(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// ユーザーのギルドアクセス権限チェック
function hasGuildAccess(user, guildId) {
  if (!user || !user.guilds || !Array.isArray(user.guilds)) {
    return false;
  }
  
  return user.guilds.some(g => g.id === guildId);
}

// ===== Authentication Routes =====

// Free版ログイン
app.get('/auth/discord/free', passport.authenticate('discord-free'));

// Pro版ログイン
app.get('/auth/discord/pro', (req, res, next) => {
  if (!DISCORD_CONFIG_PRO.clientId || !DISCORD_CONFIG_PRO.clientSecret) {
    return res.redirect('/login?error=pro_not_configured');
  }
  passport.authenticate('discord-pro')(req, res, next);
});

// 認証コールバック処理の共通関数
function handleAuthCallback(version) {
  return (req, res) => {
    req.session.save((err) => {
      if (err) {
        console.error(`[AUTH] ${version} session save error:`, err.message);
        return res.redirect('/login?error=session_failed');
      }
      
      console.log(`[AUTH] ${version} login successful for user: ${req.user?.id}`);
      res.redirect(`/dashboard?version=${version}`);
    });
  };
}

// Free版コールバック
app.get('/auth/discord/callback/free',
  passport.authenticate('discord-free', { 
    failureRedirect: '/login?error=auth_failed'
  }),
  handleAuthCallback('free')
);

// Pro版コールバック
app.get('/auth/discord/callback/pro',
  passport.authenticate('discord-pro', { 
    failureRedirect: '/login?error=auth_failed'
  }),
  handleAuthCallback('pro')
);

// ログアウト
app.get('/logout', (req, res) => {
  const userId = req.user?.id;
  
  req.logout((err) => {
    if (err) {
      console.error('[AUTH] Logout error:', err.message);
    }
    
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('[AUTH] Session destroy error:', destroyErr.message);
      }
      
      res.clearCookie('aivis.sid');
      
      if (userId) {
        console.log(`[AUTH] User ${userId} logged out`);
      }
      
      res.redirect('/');
    });
  });
});

// ===== API Routes =====

// セッション状態確認
app.get('/api/session', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        guilds: req.user.guilds || [],
        version: req.user.version || 'free'
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// サーバー一覧取得 - Bot参加チェック付き
app.get('/api/servers', requireAuth, async (req, res) => {
  try {
    const userGuilds = req.user?.guilds || [];
    const userId = req.user.id;

    console.log(`[API /api/servers] Checking ${userGuilds.length} guilds for user ${userId}`);

    // 並列でBot参加状況をチェック
    const serverChecks = await Promise.allSettled(
      userGuilds.map(async (guild) => {
        const bot = await findBotForGuild(guild.id);
        
        if (!bot) {
          return null; // Bot未参加
        }

        let iconUrl = guild.iconUrl || null;
        if (!iconUrl && guild.icon) {
          iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
        }

        return {
          id: guild.id,
          name: guild.name,
          iconUrl,
          permissions: guild.permissions,
          botName: bot.name,
          botUrl: bot.url
        };
      })
    );

    // Bot参加済みのサーバーのみフィルタリング
    const availableServers = serverChecks
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    console.log(`[API /api/servers] Found ${availableServers.length} servers with bot access`);

    res.json(availableServers);
  } catch (error) {
    console.error('[API /api/servers] Error:', error.message);
    sendErrorResponse(res, 500, 'サーバー一覧の取得に失敗しました', error.message);
  }
});

// 話者一覧取得（キャッシュ付き） - Promise.race修正
let speakersCache = null;
let speakersCacheTime = 0;
let speakersFetching = false;
const SPEAKERS_CACHE_TTL = 10 * 60 * 1000; // 10分

app.get('/api/speakers', async (req, res) => {
  try {
    // キャッシュチェック
    if (speakersCache && (Date.now() - speakersCacheTime) < SPEAKERS_CACHE_TTL) {
      console.log('[API /api/speakers] Returning cached speakers');
      return res.json(speakersCache);
    }

    // 既にフェッチ中の場合は待機
    if (speakersFetching) {
      const waitStart = Date.now();
      while (speakersFetching && (Date.now() - waitStart) < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (speakersCache) {
        return res.json(speakersCache);
      }
    }

    speakersFetching = true;

    console.log(`[API /api/speakers] Fetching from AivisSpeech: ${AIVISSPEECH_URL}/speakers`);

    // AivisSpeechから取得
    try {
      const response = await axios.get(`${AIVISSPEECH_URL}/speakers`, {
        timeout: AXIOS_TIMEOUT,
        validateStatus: (status) => status === 200
      });

      if (response.data && Array.isArray(response.data)) {
        const speakers = response.data.flatMap(speaker => {
          const styles = speaker.styles || [];
          return styles.map(style => ({
            id: style.id,
            name: `${speaker.name} (${style.name})`,
            speaker: speaker.name,
            style: style.name
          }));
        });

        console.log(`[API /api/speakers] Found ${speakers.length} speaker styles from AivisSpeech`);
        
        // キャッシュに保存
        speakersCache = speakers;
        speakersCacheTime = Date.now();
        speakersFetching = false;
        
        return res.json(speakers);
      }
    } catch (error) {
      console.warn('[API /api/speakers] AivisSpeech fetch failed:', error.message);
    }

    // フォールバック: すべてのBotから取得を試みる
    const botChecks = await Promise.allSettled(
      BOT_INSTANCES.map(async (bot) => {
        try {
          const response = await axios.get(`${bot.url}/api/speakers`, { 
            timeout: AXIOS_SHORT_TIMEOUT,
            validateStatus: (status) => status === 200
          });
          
          if (response.data && Array.isArray(response.data)) {
            return { bot, speakers: response.data };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    // 成功した最初の結果を使用
    const successfulResult = botChecks
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)[0];

    if (successfulResult?.speakers) {
      console.log(`[API /api/speakers] Loaded from bot: ${successfulResult.bot.name}`);
      
      speakersCache = successfulResult.speakers;
      speakersCacheTime = Date.now();
      speakersFetching = false;
      
      return res.json(successfulResult.speakers);
    }

    console.warn('[API /api/speakers] No speakers found from any source');
    speakersFetching = false;
    res.json([]);
  } catch (error) {
    speakersFetching = false;
    console.error('[API /api/speakers] Error:', error.message);
    sendErrorResponse(res, 500, '話者一覧の取得に失敗しました', error.message);
  }
});

// ギルド情報取得（チャンネル、設定を含む）
app.get('/api/guilds/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.user.id;

    console.log(`[API /api/guilds/${guildId}] Request from user: ${userId}`);
    console.log(`[API /api/guilds/${guildId}] User guilds:`, req.user.guilds?.map(g => g.id));

    // アクセス権限チェック
    if (!hasGuildAccess(req.user, guildId)) {
      console.warn(`[API /api/guilds/${guildId}] User ${userId} does not have access`);
      console.warn(`[API /api/guilds/${guildId}] User guild IDs:`, req.user.guilds?.map(g => g.id));
      return sendErrorResponse(res, 403, 'このサーバーにアクセスする権限がありません');
    }

    console.log(`[API /api/guilds/${guildId}] Finding bot for guild...`);
    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.warn(`[API /api/guilds/${guildId}] Guild not found in any bot`);
      return sendErrorResponse(res, 404, 'このサーバーにBotが参加していません');
    }

    console.log(`[API /api/guilds/${guildId}] Bot found: ${bot.name}`);
    console.log(`[API /api/guilds/${guildId}] Fetching guild data from: ${bot.url}/internal/guilds/${guildId}`);

    // 並列でギルド情報と設定を取得
    const [guildResponse, settingsResponse] = await Promise.allSettled([
      axios.get(`${bot.url}/internal/guilds/${guildId}`, {
        timeout: AXIOS_TIMEOUT,
        validateStatus: (status) => status === 200
      }),
      axios.get(`${bot.url}/internal/web-settings/${guildId}`, {
        timeout: AXIOS_TIMEOUT,
        validateStatus: (status) => status === 200
      })
    ]);

    if (guildResponse.status !== 'fulfilled') {
      console.error(`[API /api/guilds/${guildId}] Guild response failed:`, guildResponse.reason);
      throw new Error('Failed to fetch guild data');
    }

    const guildData = guildResponse.value.data;
    console.log(`[API /api/guilds/${guildId}] Guild data received:`, {
      name: guildData.name,
      channelsCount: guildData.channels?.length || 0
    });

    const settings = settingsResponse.status === 'fulfilled' 
      ? settingsResponse.value.data?.settings || {}
      : {};
    
    if (settingsResponse.status === 'rejected') {
      console.warn(`[API /api/guilds/${guildId}] Settings fetch failed:`, settingsResponse.reason);
    }

    // チャンネル情報の整形（タイプ名を追加）
    const CHANNEL_TYPE_NAMES = {
      0: 'GUILD_TEXT',
      2: 'GUILD_VOICE',
      4: 'GUILD_CATEGORY',
      5: 'GUILD_NEWS',
      13: 'GUILD_STAGE_VOICE'
    };

    const channels = (guildData.channels || []).map(ch => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      typeName: CHANNEL_TYPE_NAMES[ch.type] || 'UNKNOWN',
      parentId: ch.parentId || null,
      position: ch.position || 0
    }));

    // チャンネルタイプ別の集計ログ
    const channelsByType = channels.reduce((acc, ch) => {
      acc[ch.typeName] = (acc[ch.typeName] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`[API /api/guilds/${guildId}] Channels by type:`, channelsByType);
    console.log(`[API /api/guilds/${guildId}] Returning data with ${channels.length} channels`);

    const responseData = {
      id: guildId,
      name: guildData.name,
      iconUrl: guildData.iconUrl,
      channels: channels,
      botName: bot.name,
      voiceConnected: guildData.voiceConnected || false,
      voiceChannelId: guildData.voiceChannelId || null,
      textChannelId: guildData.textChannelId || null,
      settings: settings
    };

    res.json(responseData);
  } catch (error) {
    console.error(`[API /api/guilds/${req.params.guildId}] Error:`, error.message);
    console.error(`[API /api/guilds/${req.params.guildId}] Stack:`, error.stack);
    
    if (error.response?.status === 404) {
      return sendErrorResponse(res, 404, 'ギルド情報が見つかりません');
    }
    
    sendErrorResponse(res, 500, 'ギルド情報の取得に失敗しました', error.message);
  }
});

// 設定保存 - 正しいエンドポイント
app.post('/api/guilds/:guildId/settings', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { settings } = req.body;

    if (!hasGuildAccess(req.user, guildId)) {
      return sendErrorResponse(res, 403, 'このサーバーにアクセスする権限がありません');
    }

    console.log(`[API /api/guilds/${guildId}/settings POST] Saving settings`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      return sendErrorResponse(res, 404, 'このサーバーにBotが参加していません');
    }

    const response = await axios.post(`${bot.url}/api/settings`, {
      guildId,
      settings
    }, {
      timeout: AXIOS_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status === 200
    });

    if (response.data?.success) {
      console.log(`[API /api/guilds/${guildId}/settings POST] Settings saved to bot: ${bot.name}`);

      // 通知は失敗しても問題ない
      axios.post(`${bot.url}/api/settings/notify`, {
        guildId,
        settings
      }, { timeout: AXIOS_SHORT_TIMEOUT }).catch(err => {
        console.warn('[API /api/guilds/:guildId/settings POST] Notification failed:', err.message);
      });

      res.json({
        success: true,
        message: 'Settings saved',
        botName: bot.name
      });
    } else {
      throw new Error('Bot returned unsuccessful response');
    }
  } catch (error) {
    console.error(`[API /api/guilds/${req.params.guildId}/settings POST] Error:`, error.message);
    sendErrorResponse(res, 500, '設定の保存に失敗しました', error.message);
  }
});

// 個人設定取得
app.get('/api/personal-settings/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!hasGuildAccess(req.user, guildId)) {
      return sendErrorResponse(res, 403, 'このサーバーにアクセスする権限がありません');
    }

    console.log(`[API /api/personal-settings/${guildId}] Fetching for user: ${req.user.id}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.log(`[API /api/personal-settings/${guildId}] Guild not found, returning defaults`);
      return res.json({ settings: {} });
    }

    const response = await axios.get(`${bot.url}/internal/web-settings/${guildId}`, {
      timeout: AXIOS_TIMEOUT,
      validateStatus: (status) => status === 200
    });

    console.log(`[API /api/personal-settings/${guildId}] Settings loaded from bot: ${bot.name}`);
    res.json({ settings: response.data?.personalSettings || {} });
  } catch (error) {
    console.error(`[API /api/personal-settings/${req.params.guildId}] Error:`, error.message);
    res.json({ settings: {} });
  }
});

// 個人設定保存
app.post('/api/personal-settings', requireAuth, async (req, res) => {
  try {
    const { guildId, settings } = req.body;
    const userId = req.user.id;

    if (!guildId) {
      return sendErrorResponse(res, 400, 'guildId is required');
    }

    if (!hasGuildAccess(req.user, guildId)) {
      return sendErrorResponse(res, 403, 'このサーバーにアクセスする権限がありません');
    }

    console.log(`[API /api/personal-settings POST] Saving for guild: ${guildId}, user: ${userId}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      return sendErrorResponse(res, 404, 'このサーバーにBotが参加していません');
    }

    const response = await axios.post(`${bot.url}/api/personal-settings`, {
      guildId,
      userId,
      settings
    }, {
      timeout: AXIOS_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status === 200
    });

    if (response.data?.success) {
      console.log(`[API /api/personal-settings POST] Settings saved to bot: ${bot.name}`);

      axios.post(`${bot.url}/api/personal-settings/notify`, {
        guildId,
        userId,
        settings
      }, { timeout: AXIOS_SHORT_TIMEOUT }).catch(err => {
        console.warn('[API /api/personal-settings POST] Notification failed:', err.message);
      });

      res.json({
        success: true,
        message: 'Personal settings saved',
        botName: bot.name
      });
    } else {
      throw new Error('Bot returned unsuccessful response');
    }
  } catch (error) {
    console.error('[API /api/personal-settings POST] Error:', error.message);
    sendErrorResponse(res, 500, '個人設定の保存に失敗しました', error.message);
  }
});

// 辞書取得
app.get('/api/dictionary/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!hasGuildAccess(req.user, guildId)) {
      return sendErrorResponse(res, 403, 'このサーバーにアクセスする権限がありません');
    }

    console.log(`[API /api/dictionary/${guildId}] Fetching dictionary`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.log(`[API /api/dictionary/${guildId}] Guild not found, returning empty`);
      return res.json({ dictionary: [] });
    }

    const response = await axios.get(`${bot.url}/internal/web-settings/${guildId}`, {
      timeout: AXIOS_TIMEOUT,
      validateStatus: (status) => status === 200
    });

    console.log(`[API /api/dictionary/${guildId}] Dictionary loaded from bot: ${bot.name}`);

    const dictionary = response.data?.dictionary || {};
    const dictionaryArray = Object.entries(dictionary).map(([word, data]) => ({
      word,
      pronunciation: data.pronunciation || '',
      accent: data.accent || 0,
      wordType: data.wordType || 'PROPER_NOUN'
    }));

    res.json({ dictionary: dictionaryArray });
  } catch (error) {
    console.error(`[API /api/dictionary/${req.params.guildId}] Error:`, error.message);
    res.json({ dictionary: [] });
  }
});

// 辞書保存
app.post('/api/dictionary', requireAuth, async (req, res) => {
  try {
    const { guildId, dictionary } = req.body;

    if (!guildId) {
      return sendErrorResponse(res, 400, 'guildId is required');
    }

    if (!hasGuildAccess(req.user, guildId)) {
      return sendErrorResponse(res, 403, 'このサーバーにアクセスする権限がありません');
    }

    console.log(`[API /api/dictionary POST] Saving dictionary for guild: ${guildId}, entries: ${dictionary?.length || 0}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      return sendErrorResponse(res, 404, 'このサーバーにBotが参加していません');
    }

    const response = await axios.post(`${bot.url}/api/dictionary`, {
      guildId,
      dictionary
    }, {
      timeout: AXIOS_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status === 200
    });

    if (response.data?.success) {
      console.log(`[API /api/dictionary POST] Dictionary saved to bot: ${bot.name}`);

      axios.post(`${bot.url}/api/dictionary/notify`, {
        guildId,
        dictionary
      }, { timeout: AXIOS_SHORT_TIMEOUT }).catch(err => {
        console.warn('[API /api/dictionary POST] Notification failed:', err.message);
      });

      res.json({
        success: true,
        message: 'Dictionary saved',
        botName: bot.name
      });
    } else {
      throw new Error('Bot returned unsuccessful response');
    }
  } catch (error) {
    console.error('[API /api/dictionary POST] Error:', error.message);
    sendErrorResponse(res, 500, '辞書の保存に失敗しました', error.message);
  }
});

// ===== Static Pages =====

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  
  const error = req.query.error;
  
  if (error) {
    console.log(`[AUTH] Login page accessed with error: ${error}`);
  }
  
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 404ハンドラー - API用とHTML用を分離
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    console.log(`[404] API ${req.method} ${req.url}`);
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  console.log(`[404] ${req.method} ${req.url}`);
  res.status(404).sendFile(path.join(__dirname, '404.html'), (err) => {
    if (err) {
      res.status(404).send('404 Not Found');
    }
  });
});

// エラーハンドラー
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err);
  
  if (res.headersSent) {
    return next(err);
  }
  
  sendErrorResponse(res, 500, 'Internal Server Error', 
    process.env.NODE_ENV !== 'production' ? err.message : undefined);
});

// Start server
async function startServer() {
  try {
    await initialize();
    
    app.listen(PORT, HOST, () => {
      console.log(`[SERVER] Running at http://${HOST}:${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[SERVER] Base URL: ${BASE_URL}`);
      console.log(`[SERVER] Data directory: ${DATA_DIR}`);
      console.log(`[SERVER] Session store: ${sessionStoreType}`);
    });
  } catch (error) {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

// Cron scheduler
if (process.env.SITEMAP_SUBMIT_CRON) {
  const cron = require('node-cron');
  
  if (cron.validate(process.env.SITEMAP_SUBMIT_CRON)) {
    cron.schedule(process.env.SITEMAP_SUBMIT_CRON, async () => {
      try {
        console.log('[CRON] Scheduled sitemap submission starting');
        await submitSitemap();
        console.log('[CRON] Scheduled sitemap submission completed');
      } catch (err) {
        console.error('[CRON] Scheduled sitemap submission failed:', err.message);
      }
    }, { 
      timezone: process.env.SITEMAP_CRON_TZ || 'UTC',
      scheduled: true
    });
    
    console.log(`[CRON] Sitemap submission scheduled: ${process.env.SITEMAP_SUBMIT_CRON}`);
  } else {
    console.error('[CRON] Invalid cron expression:', process.env.SITEMAP_SUBMIT_CRON);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received, shutting down gracefully');
  process.exit(0);
});