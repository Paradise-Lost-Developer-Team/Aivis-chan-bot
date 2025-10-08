const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
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
        connectTimeout: 60000,
        lazyConnect: true
      }
    });

    redisClient.on('error', (err) => console.error('[REDIS] Client Error:', err));
    redisClient.on('connect', () => console.log('[REDIS] Client Connected'));
    redisClient.on('ready', () => console.log('[REDIS] Client Ready'));

    redisClient.connect().catch((err) => console.error('[REDIS] Connection failed:', err));

    redisStoreInstance = new RedisStore({
      client: redisClient,
      prefix: 'aivis:sess:',
      ttl: 24 * 60 * 60
    });
    console.log('[SESSION] Using Redis session store');
  } catch (err) {
    console.error('[SESSION] Failed to setup Redis store:', err.message);
  }
} else {
  console.log('[SESSION] Using memory store');
}

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// エラーハンドリング
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
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
  REDIS_URL: process.env.REDIS_URL ? 'set' : 'unset'
});

// 定数定義
const BASE_URL = (process.env.BASE_URL || 'https://aivis-chan-bot.com').replace(/\/$/, '');
const PATREON_CLIENT_ID = process.env.PATREON_CLIENT_ID || '';
const PATREON_CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET || '';
const PATREON_REDIRECT_URI = process.env.PATREON_REDIRECT_URI || `${BASE_URL}/auth/patreon/callback`;
const PATREON_LINKS_FILE = process.env.PATREON_LINKS_FILE || path.join('/tmp', 'data', 'patreon_links.json');

// Bot インスタンス設定
const BOT_INSTANCES = [
  { name: '1st', url: 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002' },
  { name: '2nd', url: 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003' },
  { name: '3rd', url: 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004' },
  { name: '4th', url: 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005' },
  { name: '5th', url: 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006' },
  { name: '6th', url: 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007' },
  { name: 'pro-premium', url: 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012' }
];

const BOT_ID_MAP = {
  '1333819940645638154': BOT_INSTANCES[0].url,
  '1334732369831268352': BOT_INSTANCES[1].url,
  '1334734681656262770': BOT_INSTANCES[2].url,
  '1365633502988472352': BOT_INSTANCES[3].url,
  '1365633586123771934': BOT_INSTANCES[4].url,
  '1365633656173101086': BOT_INSTANCES[5].url,
  '1415251855147008023': BOT_INSTANCES[6].url
};

// Discord OAuth設定
const DISCORD_CONFIG_FREE = {
  clientId: process.env.DISCORD_CLIENT_ID_FREE || process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_FREE || process.env.DISCORD_CLIENT_SECRET,
  redirectUri: process.env.DISCORD_REDIRECT_URI_FREE || `${BASE_URL}/auth/discord/callback/free`,
  version: 'free'
};

const DISCORD_CONFIG_PRO = {
  clientId: process.env.DISCORD_CLIENT_ID_PRO,
  clientSecret: process.env.DISCORD_CLIENT_SECRET_PRO,
  redirectUri: process.env.DISCORD_REDIRECT_URI_PRO || `${BASE_URL}/auth/discord/callback/pro`,
  version: 'pro'
};

// Passport設定
async function enrichProfile(profile, accessToken, version) {
  profile.version = version;
  profile.accessToken = accessToken;
  
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
        iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
        owner: guild.owner || false,
        permissions: guild.permissions || null
      }));
    }
  } catch (e) {
    console.warn(`[passport][${version}] failed to enrich profile:`, e.message);
  }
  
  return profile;
}

if (DISCORD_CONFIG_FREE.clientId && DISCORD_CONFIG_FREE.clientSecret) {
  passport.use('discord-free', new DiscordStrategy({
    clientID: DISCORD_CONFIG_FREE.clientId,
    clientSecret: DISCORD_CONFIG_FREE.clientSecret,
    callbackURL: DISCORD_CONFIG_FREE.redirectUri,
    scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const enriched = await enrichProfile(profile, accessToken, 'free');
      return done(null, enriched, { accessToken });
    } catch (error) {
      return done(error);
    }
  }));
}

if (DISCORD_CONFIG_PRO.clientId && DISCORD_CONFIG_PRO.clientSecret) {
  passport.use('discord-pro', new DiscordStrategy({
    clientID: DISCORD_CONFIG_PRO.clientId,
    clientSecret: DISCORD_CONFIG_PRO.clientSecret,
    callbackURL: DISCORD_CONFIG_PRO.redirectUri,
    scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const enriched = await enrichProfile(profile, accessToken, 'pro');
      return done(null, enriched, { accessToken });
    } catch (error) {
      return done(error);
    }
  }));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// 認証ミドルウェア
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  console.log('[AUTH] Unauthorized access to:', req.path);
  return res.redirect('/login');
}

// ミドルウェア設定（重要：順序を守る）
app.set('trust proxy', 1);

// JSONパーサー（POSTリクエスト用 - セッションより前に配置）
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// セッション設定
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: BASE_URL.startsWith('https'),
    sameSite: BASE_URL.startsWith('https') ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  },
  name: 'connect.sid'
};

if (redisStoreInstance) sessionConfig.store = redisStoreInstance;

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// リクエストロガー
app.use((req, res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url} Host:${req.headers.host}`);
  next();
});

// SEO: ダッシュボードにnoindexタグ
app.use((req, res, next) => {
  const path = req.url || req.path || '';
  if (path === '/dashboard' || path.startsWith('/dashboard')) {
    res.set('X-Robots-Tag', 'noindex');
  }
  next();
});

// 静的ファイル
app.use(express.static(__dirname));

// ===== API エンドポイント =====

// Bot統計情報
app.get('/api/bot-stats', async (req, res) => {
  try {
    const results = await Promise.all(
      Object.entries(BOT_ID_MAP).map(async ([botId, url]) => {
        try {
          const response = await axios.get(`${url}/api/stats`, { timeout: 5000 });
          const data = response.data || {};
          return {
            bot_id: botId,
            success: true,
            server_count: data.server_count || 0,
            user_count: data.user_count || 0,
            vc_count: data.vc_count || 0,
            uptime: data.uptime || 0,
            shard_count: data.shard_count || 0,
            online: data.online !== false
          };
        } catch (error) {
          return { bot_id: botId, success: false, error: error.message };
        }
      })
    );
    
    const online_bots = results.filter(r => r.success && r.online).length;
    res.json({ 
      bots: results, 
      total_bots: results.length, 
      online_bots,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ギルド一覧取得
app.get('/api/servers', requireAuth, async (req, res) => {
  try {
    console.log('[API /api/servers] Request received');
    
    if (!req.user || !req.user.guilds) {
      return res.status(401).json({ error: 'Not authenticated or no guilds' });
    }

    const userGuilds = req.user.guilds;
    console.log(`[API /api/servers] User has ${userGuilds.length} guilds`);

    // 各Botからギルド情報を取得
    const botResults = await Promise.all(
      BOT_INSTANCES.map(async (bot) => {
        try {
          const response = await axios.get(`${bot.url}/internal/info`, { timeout: 3000 });
          console.log(`[API /api/servers] ${bot.name} returned ${response.data?.guilds?.length || 0} guilds`);
          return { name: bot.name, guilds: response.data?.guilds || [] };
        } catch (error) {
          console.warn(`[API /api/servers] ${bot.name} failed:`, error.message);
          return { name: bot.name, guilds: [] };
        }
      })
    );

    // Botがいるギルドをマージ
    const botGuildIds = new Set();
    botResults.forEach(result => {
      result.guilds.forEach(guild => botGuildIds.add(guild.id));
    });

    // ユーザーが管理権限を持ち、Botがいるギルドのみ返す
    const filteredServers = userGuilds
      .filter(guild => {
        const hasManagePerms = (BigInt(guild.permissions || 0) & BigInt(0x20)) === BigInt(0x20);
        const hasBotInGuild = botGuildIds.has(guild.id);
        return hasManagePerms && hasBotInGuild;
      })
      .map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconUrl: guild.iconUrl
      }));

    console.log(`[API /api/servers] Returning ${filteredServers.length} servers`);
    res.json(filteredServers);
  } catch (error) {
    console.error('[API /api/servers] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ギルドのチャンネル取得
app.get('/api/guilds/:guildId', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  console.log(`[API /api/guilds/${guildId}] Request received`);
  
  try {
    const results = await Promise.all(
      BOT_INSTANCES.map(async (bot) => {
        try {
          const response = await axios.get(`${bot.url}/api/guilds/${guildId}`, { 
            timeout: 3000,
            validateStatus: (status) => status < 500
          });
          
          if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
            console.log(`[API /api/guilds/${guildId}] Got ${response.data.length} channels from ${bot.name}`);
            return { success: true, data: response.data, bot: bot.name };
          }
          
          return { success: false };
        } catch (error) {
          return { success: false };
        }
      })
    );

    const successResult = results.find(r => r.success);
    
    if (successResult) {
      return res.json(successResult.data);
    }
    
    res.status(503).json({ error: 'No channels available' });
  } catch (error) {
    console.error(`[API /api/guilds/${guildId}] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 設定保存エンドポイント
app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const { guildId, settings } = req.body;
    
    if (!guildId) {
      return res.status(400).json({ error: 'guildId is required' });
    }

    const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'settings.json');
    await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    
    // 全Botに通知
    await Promise.allSettled(
      BOT_INSTANCES.map(bot => 
        axios.post(`${bot.url}/api/settings/notify`, 
          { guildId, settings },
          { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        ).catch(err => console.log(`Failed to notify ${bot.name}: ${err.message}`))
      )
    );
    
    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    console.error('[API /api/settings] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 個人設定保存エンドポイント
app.post('/api/personal-settings', requireAuth, async (req, res) => {
  try {
    const { guildId, settings } = req.body;
    const userId = req.user?.id;
    
    if (!guildId || !userId) {
      return res.status(400).json({ error: 'guildId and userId required' });
    }

    const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'personal', `${userId}.json`);
    await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    
    await Promise.allSettled(
      BOT_INSTANCES.map(bot => 
        axios.post(`${bot.url}/api/personal-settings/notify`,
          { guildId, userId, settings },
          { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        ).catch(err => console.log(`Failed to notify ${bot.name}: ${err.message}`))
      )
    );
    
    res.json({ success: true, message: 'Personal settings saved' });
  } catch (error) {
    console.error('[API /api/personal-settings] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 辞書保存エンドポイント
app.post('/api/dictionary', requireAuth, async (req, res) => {
  try {
    const { guildId, dictionary } = req.body;
    
    if (!guildId) {
      return res.status(400).json({ error: 'guildId required' });
    }

    const dictPath = path.join(__dirname, 'data', 'guilds', guildId, 'dictionary.json');
    await fsPromises.mkdir(path.dirname(dictPath), { recursive: true });
    await fsPromises.writeFile(dictPath, JSON.stringify(dictionary, null, 2));
    
    await Promise.allSettled(
      BOT_INSTANCES.map(bot => 
        axios.post(`${bot.url}/api/dictionary/notify`,
          { guildId, dictionary },
          { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
        ).catch(err => console.log(`Failed to notify ${bot.name}: ${err.message}`))
      )
    );
    
    res.json({ success: true, message: 'Dictionary saved' });
  } catch (error) {
    console.error('[API /api/dictionary] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ギルド設定取得
app.get('/api/guilds/:guildId/settings', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  console.log(`[API /api/guilds/${guildId}/settings] Request received`);
  
  try {
    const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'settings.json');
    
    try {
      const data = await fsPromises.readFile(settingsPath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        // ファイルが存在しない場合はデフォルト設定を返す
        res.json({});
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(`[API /api/guilds/${guildId}/settings] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 個人設定取得
app.get('/api/guilds/:guildId/personal-settings', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  console.log(`[API /api/guilds/${guildId}/personal-settings] Request for user ${userId}`);
  
  try {
    const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'personal', `${userId}.json`);
    
    try {
      const data = await fsPromises.readFile(settingsPath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({});
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(`[API /api/guilds/${guildId}/personal-settings] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 辞書取得
app.get('/api/guilds/:guildId/dictionary', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  console.log(`[API /api/guilds/${guildId}/dictionary] Request received`);
  
  try {
    const dictPath = path.join(__dirname, 'data', 'guilds', guildId, 'dictionary.json');
    
    try {
      const data = await fsPromises.readFile(dictPath, 'utf8');
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json([]);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error(`[API /api/guilds/${guildId}/dictionary] Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 話者一覧取得
app.get('/api/speakers', async (req, res) => {
  console.log('[API /api/speakers] Request received');
  
  try {
    // いずれかのBotから話者一覧を取得
    for (const bot of BOT_INSTANCES) {
      try {
        console.log(`[API /api/speakers] Trying ${bot.name}`);
        const response = await axios.get(`${bot.url}/api/speakers`, { 
          timeout: 3000,
          validateStatus: (status) => status < 500
        });
        
        if (response.status === 200 && Array.isArray(response.data)) {
          console.log(`[API /api/speakers] Got speakers from ${bot.name}`);
          return res.json(response.data);
        }
      } catch (error) {
        console.warn(`[API /api/speakers] ${bot.name} failed:`, error.message);
        continue;
      }
    }
    
    res.status(503).json({ error: 'No speakers available' });
  } catch (error) {
    console.error('[API /api/speakers] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bot間通信エンドポイント（内部用）
app.post('/api/receive', express.json(), (req, res) => {
  console.log('[API /api/receive] Received data from bot:', {
    body: req.body ? Object.keys(req.body) : 'empty',
    headers: req.headers['user-agent']
  });
  
  // Bot間の通信データを処理（必要に応じて）
  res.json({ success: true, message: 'Data received' });
});

// Patreon認証（既存コードがある場合）
if (PATREON_CLIENT_ID && PATREON_CLIENT_SECRET) {
  app.get('/auth/patreon', (req, res) => {
    const state = Buffer.from(JSON.stringify({ 
      userId: req.user?.id,
      timestamp: Date.now() 
    })).toString('base64');
    
    const authUrl = `https://www.patreon.com/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${PATREON_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(PATREON_REDIRECT_URI)}&` +
      `scope=identity identity[email] campaigns campaigns.members&` +
      `state=${state}`;
    
    res.redirect(authUrl);
  });

  app.get('/auth/patreon/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
      return res.redirect('/dashboard?error=patreon_auth_failed');
    }
    
    try {
      const tokenResponse = await axios.post('https://www.patreon.com/api/oauth2/token', {
        code,
        grant_type: 'authorization_code',
        client_id: PATREON_CLIENT_ID,
        client_secret: PATREON_CLIENT_SECRET,
        redirect_uri: PATREON_REDIRECT_URI
      });
      
      const accessToken = tokenResponse.data.access_token;
      
      const userResponse = await axios.get('https://www.patreon.com/api/oauth2/v2/identity', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          'include': 'memberships',
          'fields[user]': 'email,full_name',
          'fields[member]': 'patron_status,currently_entitled_amount_cents'
        }
      });
      
      // Patreonデータを保存
      const patreonData = {
        patreon_id: userResponse.data.data.id,
        discord_id: req.user?.id,
        email: userResponse.data.data.attributes.email,
        full_name: userResponse.data.data.attributes.full_name,
        memberships: userResponse.data.included || [],
        linked_at: new Date().toISOString()
      };
      
      // ファイルに保存
      await fsPromises.mkdir(path.dirname(PATREON_LINKS_FILE), { recursive: true });
      
      let existingLinks = [];
      try {
        const data = await fsPromises.readFile(PATREON_LINKS_FILE, 'utf8');
        existingLinks = JSON.parse(data);
      } catch (error) {
        // ファイルが存在しない場合は新規作成
      }
      
      // 既存データを更新または追加
      const index = existingLinks.findIndex(link => link.discord_id === req.user?.id);
      if (index >= 0) {
        existingLinks[index] = patreonData;
      } else {
        existingLinks.push(patreonData);
      }
      
      await fsPromises.writeFile(PATREON_LINKS_FILE, JSON.stringify(existingLinks, null, 2));
      
      res.redirect('/dashboard?patreon=linked');
    } catch (error) {
      console.error('[PATREON] Auth error:', error);
      res.redirect('/dashboard?error=patreon_link_failed');
    }
  });
}

// Solana関連エンドポイント（既存コードがある場合）
app.get('/api/solana/balance/:address', async (req, res) => {
  const { address } = req.params;
  
  try {
    const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    
    res.json({ 
      address,
      balance: balance / 1e9, // SOL単位に変換
      lamports: balance
    });
  } catch (error) {
    console.error('[SOLANA] Balance check error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Google Analytics関連（既存コードがある場合）
if (process.env.GOOGLE_ANALYTICS_PROPERTY_ID) {
  app.get('/api/analytics/pageviews', requireAuth, async (req, res) => {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}'),
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
      });
      
      const analyticsData = google.analyticsdata('v1beta');
      const response = await analyticsData.properties.runReport({
        auth,
        property: `properties/${process.env.GOOGLE_ANALYTICS_PROPERTY_ID}`,
        requestBody: {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          metrics: [{ name: 'screenPageViews' }],
          dimensions: [{ name: 'pagePath' }]
        }
      });
      
      res.json(response.data);
    } catch (error) {
      console.error('[ANALYTICS] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// ===== 認証ルート =====

// ログインページ
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Discord OAuth - Free版
app.get('/auth/discord/free', passport.authenticate('discord-free'));

app.get('/auth/discord/callback/free', 
  passport.authenticate('discord-free', { 
    failureRedirect: '/login?error=auth_failed' 
  }), 
  (req, res) => {
    const redirectTo = req.session.returnTo || '/dashboard?version=free';
    delete req.session.returnTo;
    res.redirect(redirectTo);
  }
);

// Discord OAuth - Pro版
app.get('/auth/discord/pro', passport.authenticate('discord-pro'));

app.get('/auth/discord/callback/pro', 
  passport.authenticate('discord-pro', { 
    failureRedirect: '/login?error=auth_failed' 
  }), 
  (req, res) => {
    const redirectTo = req.session.returnTo || '/dashboard?version=pro';
    delete req.session.returnTo;
    res.redirect(redirectTo);
  }
);

// ログアウト
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('[AUTH] Logout error:', err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('[AUTH] Session destroy error:', err);
      }
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

// セッション情報取得（デバッグ用）
app.get('/api/session', (req, res) => {
  console.log('[DEBUG] /api/session called');
  console.log('[DEBUG] isAuthenticated:', req.isAuthenticated ? req.isAuthenticated() : false);
  console.log('[DEBUG] req.user:', req.user ? { id: req.user.id, username: req.user.username, guilds: req.user.guilds?.length } : null);
  console.log('[DEBUG] sessionID:', req.sessionID);
  
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username || req.user.nickname,
        discriminator: req.user.discriminator,
        avatar: req.user.avatarUrl || req.user.avatar,
        version: req.user.version
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ===== ページルート =====

// トップページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ダッシュボード
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// サーバー起動
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`[LISTEN] app listening on ${HOST}:${PORT} (PID ${process.pid})`);
  });
}

module.exports = app;
