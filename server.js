const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { google } = require('googleapis');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// Redis セッションストア設定
let redisStoreInstance = null;

if (process.env.SESSION_STORE === 'redis') {
  try {
    const RedisStore = require('connect-redis').default;
    const redis = require('redis');
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis reconnect attempts exceeded');
          }
          return Math.min(retries * 100, 3000);
        }
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
      ttl: 24 * 60 * 60
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
const BASE_URL = process.env.BASE_URL || 'https://aivis-chan-bot.com';

// Data directories
const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'aivis-data');
const PATREON_LINKS_FILE = path.join(DATA_DIR, 'patreon_links.json');
const PATREON_CALLBACK_LOG = path.join(DATA_DIR, 'patreon_callbacks.log');
const SOLANA_INVOICES_FILE = path.join(DATA_DIR, 'solana_invoices.json');

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

// Patreon OAuth2設定
const PATREON_CLIENT_ID = process.env.PATREON_CLIENT_ID || '';
const PATREON_CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET || '';
const PATREON_REDIRECT_PATH = '/auth/patreon/callback';
const PATREON_REDIRECT_URI = `${BASE_URL.replace(/\/$/, '')}${PATREON_REDIRECT_PATH}`;

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
function ensurePatreonLinksFile() {
  try {
    const dir = path.dirname(PATREON_LINKS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      console.log(`[PATREON] Created directory: ${dir}`);
    }
    if (!fs.existsSync(PATREON_LINKS_FILE)) {
      fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify([]), { mode: 0o666 });
      console.log(`[PATREON] Created file: ${PATREON_LINKS_FILE}`);
    }
  } catch (e) {
    console.error('ensurePatreonLinksFile error:', e.message);
    console.warn(`[PATREON] Will operate without persistent storage. Links will be lost on restart.`);
  }
}

function ensureSolanaInvoicesFile() {
  try {
    const dir = path.dirname(SOLANA_INVOICES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      console.log(`[SOLANA] Created directory: ${dir}`);
    }
    if (!fs.existsSync(SOLANA_INVOICES_FILE)) {
      fs.writeFileSync(SOLANA_INVOICES_FILE, JSON.stringify([]), { mode: 0o666 });
      console.log(`[SOLANA] Created file: ${SOLANA_INVOICES_FILE}`);
    }
  } catch (e) {
    console.error('ensureSolanaInvoicesFile error:', e.message);
    console.warn(`[SOLANA] Will operate without persistent storage. Invoices will be lost on restart.`);
  }
}

function loadSolanaInvoices() {
  try {
    ensureSolanaInvoicesFile();
    if (!fs.existsSync(SOLANA_INVOICES_FILE)) return [];
    const raw = fs.readFileSync(SOLANA_INVOICES_FILE, 'utf8') || '[]';
    return JSON.parse(raw);
  } catch (e) {
    console.error('loadSolanaInvoices error:', e.message);
    return [];
  }
}

function saveSolanaInvoices(arr) {
  try {
    ensureSolanaInvoicesFile();
    fs.writeFileSync(SOLANA_INVOICES_FILE, JSON.stringify(arr, null, 2), { mode: 0o666 });
    return true;
  } catch (e) {
    console.error('saveSolanaInvoices error:', e.message);
    return false;
  }
}

function tryDecodeBase64Json(s) {
  try {
    const buf = Buffer.from(String(s), 'base64');
    const txt = buf.toString('utf8');
    if (!txt) return null;
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
        // fall through
      }
    }
    const plain = trimmed;
    if (/^\d{5,22}$/.test(plain)) return plain;
    return null;
  } catch (e) {
    return null;
  }
}

function migratePatreonLinks() {
  try {
    if (!fs.existsSync(PATREON_LINKS_FILE)) {
      console.log('[PATREON] No existing links file to migrate');
      return;
    }

    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8') || '[]';
    const arr = JSON.parse(raw);
    let changed = false;
    const toRemove = new Set();

    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      const stored = String(entry.discordId || '');
      const decoded = tryDecodeBase64Json(stored);
      if (decoded && stored !== decoded) {
        const existsPlainIndex = arr.findIndex(x => String(x.discordId) === decoded);
        if (existsPlainIndex === -1) {
          entry.originalState = stored;
          entry.discordId = decoded;
          changed = true;
        } else {
          toRemove.add(i);
          changed = true;
        }
      }
    }

    if (toRemove.size > 0) {
      const indices = Array.from(toRemove).sort((a, b) => b - a);
      for (const idx of indices) arr.splice(idx, 1);
    }

    if (changed) {
      const bak = PATREON_LINKS_FILE + '.bak.' + Date.now();
      try {
        fs.copyFileSync(PATREON_LINKS_FILE, bak);
        console.log('[PATREON] backup saved to', bak);
      } catch (e) {
        console.warn('[PATREON] failed to save backup:', e.message);
      }
      fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify(arr, null, 2), { mode: 0o666 });
      console.log('[PATREON] migrated patreon_links.json - plain discordId fields ensured');
    } else {
      console.log('[PATREON] no migration needed for patreon_links.json');
    }
  } catch (e) {
    console.error('[PATREON] migratePatreonLinks error:', e.message);
    console.warn('[PATREON] Migration failed - continuing without migration');
  }
}

function savePatreonLink(link) {
  try {
    ensurePatreonLinksFile();

    if (!fs.existsSync(PATREON_LINKS_FILE)) {
      console.warn('[PATREON] Links file does not exist, creating new one');
      fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify([]), { mode: 0o666 });
    }

    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8');
    const arr = JSON.parse(raw || '[]');

    const incoming = Object.assign({}, link);
    const storedVal = String(incoming.discordId || '');
    let decoded = tryDecodeBase64Json(storedVal);

    if (decoded) {
      incoming.originalState = incoming.originalState || storedVal;
      incoming.discordId = decoded;
    } else {
      if (storedVal && storedVal.includes(':')) {
        const left = storedVal.split(':', 1)[0];
        const leftDecoded = tryDecodeBase64Json(left);
        if (leftDecoded) {
          incoming.originalState = incoming.originalState || left;
          incoming.discordId = leftDecoded;
        } else if (/^\d{5,22}$/.test(left)) {
          incoming.discordId = left;
        }
      }
      if (!incoming.discordId && /^\d{5,22}$/.test(storedVal)) {
        incoming.discordId = storedVal;
      }
    }

    incoming.createdAt = new Date().toISOString();

    const idx = arr.findIndex(x => String(x.discordId) === String(incoming.discordId));
    if (idx !== -1) {
      const existing = arr[idx] || {};
      const merged = Object.assign({}, existing, incoming);
      if (!merged.originalState && existing.originalState) merged.originalState = existing.originalState;
      arr[idx] = merged;
    } else {
      arr.push(incoming);
    }

    fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify(arr, null, 2), { mode: 0o666 });
    console.log(`[PATREON] Saved link for discordId: ${incoming.discordId}`);
  } catch (e) {
    console.error('savePatreonLink error:', e.message);
    console.warn('[PATREON] Failed to save link - data will be lost on restart');
  }
}

function appendPatreonCallbackLog(data) {
  try {
    const logLine = JSON.stringify(data) + '\n';
    fs.appendFileSync(PATREON_CALLBACK_LOG, logLine);
  } catch (e) {
    console.error('appendPatreonCallbackLog error:', e.message);
  }
}

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

// ギルドが所属するBotインスタンスを検索
async function findBotForGuild(guildId) {
  for (const bot of BOT_INSTANCES) {
    try {
      const response = await axios.get(`${bot.url}/internal/guilds/${guildId}`, {
        timeout: 3000
      });

      if (response.data) {
        console.log(`[findBotForGuild] Guild ${guildId} found in bot: ${bot.name}`);
        return bot;
      }
    } catch (error) {
      continue;
    }
  }

  console.warn(`[findBotForGuild] Guild ${guildId} not found in any bot instance`);
  return null;
}

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
    }

    return true;
  } catch (error) {
    console.error('[SITEMAP] Submission failed:', error.message);
    return false;
  }
}

// Run migration on startup
try {
  ensurePatreonLinksFile();
  migratePatreonLinks();
} catch (e) {
  console.error('[PATREON] startup migration error:', e.message);
  console.warn('[PATREON] Continuing without migration - links may not be migrated');
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
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
};

if (redisStoreInstance) {
  sessionConfig.store = redisStoreInstance;
}

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url} Host:${req.headers.host} UA:${req.headers['user-agent']}`);
  next();
});

// SEO: noindex for dashboard
app.use((req, res, next) => {
  try {
    const u = req.url || req.path || '';
    if (u === '/dashboard' || u.startsWith('/dashboard')) {
      res.set('X-Robots-Tag', 'noindex');
    }
  } catch (e) {
    console.warn('[SEO] failed to set X-Robots-Tag', e && e.message);
  }
  next();
});

// 認証ミドルウェア - API用
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized', authenticated: false });
}

// 認証ミドルウェア - HTMLページ用
function requireAuthPage(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  // ログインページにリダイレクト
  res.redirect('/login');
}

// ===== Authentication Routes =====

// Free版ログイン
app.get('/auth/discord/free', passport.authenticate('discord-free'));

// Pro版ログイン
app.get('/auth/discord/pro', passport.authenticate('discord-pro'));

// Free版コールバック
app.get('/auth/discord/callback/free',
  passport.authenticate('discord-free', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/dashboard?version=free');
  }
);

// Pro版コールバック
app.get('/auth/discord/callback/pro',
  passport.authenticate('discord-pro', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/dashboard?version=pro');
  }
);

// ログアウト
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('[AUTH] Logout error:', err);
    }
    res.redirect('/');
  });
});

// ===== API Routes =====

// セッション状態確認
app.get('/api/session', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        guilds: req.user.guilds,
        version: req.user.version || 'free'
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// サーバー一覧取得
app.get('/api/servers', requireAuth, async (req, res) => {
  try {
    const userGuilds = req.user && Array.isArray(req.user.guilds) ? req.user.guilds : [];

    console.log(`[API /api/servers] Returning ${userGuilds.length} guilds for user ${req.user.id}`);

    const normalizedServers = userGuilds.map(s => {
      let iconUrl = s.iconUrl || null;
      if (!iconUrl) {
        const iconHash = s.icon || s.iconHash || null;
        if (iconHash) {
          iconUrl = `https://cdn.discordapp.com/icons/${s.id}/${iconHash}.png`;
        }
      }
      return {
        id: s.id,
        name: s.name,
        iconUrl,
        permissions: s.permissions
      };
    });

    res.json(normalizedServers);
  } catch (error) {
    console.error('[API /api/servers] Error:', error);
    res.status(500).json({ error: 'サーバー一覧の取得に失敗しました' });
  }
});

// 話者一覧取得
app.get('/api/speakers', async (req, res) => {
  try {
    console.log(`[API /api/speakers] Fetching from AivisSpeech: ${AIVISSPEECH_URL}/speakers`);

    try {
      const response = await axios.get(`${AIVISSPEECH_URL}/speakers`, {
        timeout: 5000
      });

      if (response.data && Array.isArray(response.data)) {
        const speakers = response.data.map(speaker => {
          const styles = speaker.styles || [];
          return styles.map(style => ({
            id: style.id,
            name: `${speaker.name} (${style.name})`,
            speaker: speaker.name,
            style: style.name
          }));
        }).flat();

        console.log(`[API /api/speakers] Found ${speakers.length} speaker styles`);
        return res.json(speakers);
      }
    } catch (error) {
      console.warn('[API /api/speakers] AivisSpeech fetch failed:', error.message);
    }

    // フォールバック: Botから取得
    for (const bot of BOT_INSTANCES) {
      try {
        const response = await axios.get(`${bot.url}/api/speakers`, { timeout: 3000 });
        if (response.data) {
          console.log(`[API /api/speakers] Loaded from bot: ${bot.name}`);
          return res.json(response.data);
        }
      } catch (error) {
        continue;
      }
    }

    return res.json([]);
  } catch (error) {
    console.error('[API /api/speakers] Error:', error);
    res.status(500).json({ error: '話者一覧の取得に失敗しました' });
  }
});

// ギルド情報取得
app.get('/api/guilds/:guildId', requireAuth, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const userId = req.user.id;

    console.log(`[API /api/guilds/${guildId}] Request from user: ${userId}`);

    const userGuilds = req.user.guilds || [];
    const guild = userGuilds.find(g => g.id === guildId);

    if (!guild) {
      console.warn(`[API /api/guilds/${guildId}] User ${userId} does not have access`);
      return res.status(403).json({ error: 'このサーバーにアクセスする権限がありません' });
    }

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.warn(`[API /api/guilds/${guildId}] Guild not found in any bot`);
      return res.status(404).json({
        error: 'このサーバーにBotが参加していません',
        message: 'BotをサーバーにDiscord経由で招待してください'
      });
    }

    const response = await axios.get(`${bot.url}/internal/guilds/${guildId}`, {
      timeout: 5000
    });

    const guildData = response.data;

    console.log(`[API /api/guilds/${guildId}] Guild data received from bot: ${bot.name}`);

    res.json({
      id: guildId,
      name: guildData.name,
      iconUrl: guildData.iconUrl,
      channels: guildData.channels || [],
      botName: bot.name,
      voiceConnected: guildData.voiceConnected || false,
      voiceChannelId: guildData.voiceChannelId || null,
      textChannelId: guildData.textChannelId || null
    });
  } catch (error) {
    console.error(`[API /api/guilds/${req.params.guildId}] Error:`, error);
    res.status(500).json({ error: 'ギルド情報の取得に失敗しました' });
  }
});

// 設定取得
app.get('/api/settings/:guildId', requireAuth, async (req, res) => {
  try {
    const guildId = req.params.guildId;

    console.log(`[API /api/settings/${guildId}] Fetching settings`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.log(`[API /api/settings/${guildId}] Guild not found, returning defaults`);
      return res.json({ settings: {} });
    }

    const response = await axios.get(`${bot.url}/internal/web-settings/${guildId}`, {
      timeout: 5000
    });

    console.log(`[API /api/settings/${guildId}] Settings loaded from bot: ${bot.name}`);
    res.json({ settings: response.data?.settings || {} });
  } catch (error) {
    console.error(`[API /api/settings/${req.params.guildId}] Error:`, error);
    res.json({ settings: {} });
  }
});

// 設定保存
app.post('/api/settings', express.json(), requireAuth, async (req, res) => {
  try {
    const { guildId, settings } = req.body;

    if (!guildId) {
      return res.status(400).json({ error: 'guildId is required' });
    }

    console.log(`[API /api/settings POST] Saving settings for guild: ${guildId}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      return res.status(404).json({
        error: 'このサーバーにBotが参加していません'
      });
    }

    const response = await axios.post(`${bot.url}/api/settings`, {
      guildId: guildId,
      settings: settings
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.success) {
      console.log(`[API /api/settings POST] Settings saved to bot: ${bot.name}`);

      try {
        await axios.post(`${bot.url}/api/settings/notify`, {
          guildId: guildId,
          settings: settings
        }, { timeout: 3000 });
      } catch (notifyError) {
        console.warn('Settings notification failed:', notifyError.message);
      }

      res.json({
        success: true,
        message: 'Settings saved',
        botName: bot.name
      });
    } else {
      throw new Error('Bot returned unsuccessful response');
    }
  } catch (error) {
    console.error('[API /api/settings POST] Error:', error);
    res.status(500).json({
      error: '設定の保存に失敗しました',
      details: error.message
    });
  }
});

// 個人設定取得
app.get('/api/personal-settings/:guildId', requireAuth, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const userId = req.user.id;

    console.log(`[API /api/personal-settings/${guildId}] Fetching for user: ${userId}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.log(`[API /api/personal-settings/${guildId}] Guild not found, returning defaults`);
      return res.json({ settings: {} });
    }

    const response = await axios.get(`${bot.url}/internal/web-settings/${guildId}`, {
      timeout: 5000
    });

    console.log(`[API /api/personal-settings/${guildId}] Settings loaded from bot: ${bot.name}`);
    res.json({ settings: response.data?.personalSettings || {} });
  } catch (error) {
    console.error(`[API /api/personal-settings/${req.params.guildId}] Error:`, error);
    res.json({ settings: {} });
  }
});

// 個人設定保存
app.post('/api/personal-settings', express.json(), requireAuth, async (req, res) => {
  try {
    const { guildId, settings } = req.body;
    const userId = req.user.id;

    if (!guildId) {
      return res.status(400).json({ error: 'guildId is required' });
    }

    console.log(`[API /api/personal-settings POST] Saving for guild: ${guildId}, user: ${userId}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      return res.status(404).json({
        error: 'このサーバーにBotが参加していません'
      });
    }

    const response = await axios.post(`${bot.url}/api/personal-settings`, {
      guildId: guildId,
      userId: userId,
      settings: settings
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.success) {
      console.log(`[API /api/personal-settings POST] Settings saved to bot: ${bot.name}`);

      try {
        await axios.post(`${bot.url}/api/personal-settings/notify`, {
          guildId: guildId,
          userId: userId,
          settings: settings
        }, { timeout: 3000 });
      } catch (notifyError) {
        console.warn('Personal settings notification failed:', notifyError.message);
      }

      res.json({
        success: true,
        message: 'Personal settings saved',
        botName: bot.name
      });
    } else {
      throw new Error('Bot returned unsuccessful response');
    }
  } catch (error) {
    console.error('[API /api/personal-settings POST] Error:', error);
    res.status(500).json({
      error: '個人設定の保存に失敗しました',
      details: error.message
    });
  }
});

// 辞書取得
app.get('/api/dictionary/:guildId', requireAuth, async (req, res) => {
  try {
    const guildId = req.params.guildId;

    console.log(`[API /api/dictionary/${guildId}] Fetching dictionary`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      console.log(`[API /api/dictionary/${guildId}] Guild not found, returning empty`);
      return res.json({ dictionary: [] });
    }

    const response = await axios.get(`${bot.url}/internal/web-settings/${guildId}`, {
      timeout: 5000
    });

    console.log(`[API /api/dictionary/${guildId}] Dictionary loaded from bot: ${bot.name}`);

    const dictionary = response.data?.dictionary || {};
    const dictionaryArray = Object.entries(dictionary).map(([word, data]) => ({
      word: word,
      pronunciation: data.pronunciation || '',
      accent: data.accent || 0,
      wordType: data.wordType || 'PROPER_NOUN'
    }));

    res.json({ dictionary: dictionaryArray });
  } catch (error) {
    console.error(`[API /api/dictionary/${req.params.guildId}] Error:`, error);
    res.json({ dictionary: [] });
  }
});

// 辞書保存
app.post('/api/dictionary', express.json(), requireAuth, async (req, res) => {
  try {
    const { guildId, dictionary } = req.body;

    if (!guildId) {
      return res.status(400).json({ error: 'guildId is required' });
    }

    console.log(`[API /api/dictionary POST] Saving dictionary for guild: ${guildId}, entries: ${dictionary?.length || 0}`);

    const bot = await findBotForGuild(guildId);

    if (!bot) {
      return res.status(404).json({
        error: 'このサーバーにBotが参加していません'
      });
    }

    const response = await axios.post(`${bot.url}/api/dictionary`, {
      guildId: guildId,
      dictionary: dictionary
    }, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.success) {
      console.log(`[API /api/dictionary POST] Dictionary saved to bot: ${bot.name}`);

      try {
        await axios.post(`${bot.url}/api/dictionary/notify`, {
          guildId: guildId,
          dictionary: dictionary
        }, { timeout: 3000 });
      } catch (notifyError) {
        console.warn('Dictionary notification failed:', notifyError.message);
      }

      res.json({
        success: true,
        message: 'Dictionary saved',
        botName: bot.name
      });
    } else {
      throw new Error('Bot returned unsuccessful response');
    }
  } catch (error) {
    console.error('[API /api/dictionary POST] Error:', error);
    res.status(500).json({
      error: '辞書の保存に失敗しました',
      details: error.message
    });
  }
});

// ===== Static Pages =====

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  // すでにログイン済みの場合はダッシュボードへ
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
});

// Cron scheduler
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