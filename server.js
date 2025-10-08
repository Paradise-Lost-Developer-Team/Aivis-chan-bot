const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// エラーハンドリング（最初に設定）
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err && (err.stack || err.message || err));
  setTimeout(() => process.exit(1), 200);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  setTimeout(() => process.exit(1), 200);
});

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Redis セッションストア設定
let redisStoreInstance = null;
if (process.env.SESSION_STORE === 'redis') {
  try {
    const RedisStore = require('connect-redis').default;
    const redis = require('redis');
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { connectTimeout: 60000, lazyConnect: true }
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

console.log('[STARTUP] server env summary:', {
  PORT,
  HOST,
  BASE_URL: process.env.BASE_URL ? 'set' : 'unset',
  SESSION_STORE: process.env.SESSION_STORE || 'memory',
  REDIS_URL: process.env.REDIS_URL ? 'set' : 'unset',
  PATREON_REDIRECT_URI: process.env.PATREON_REDIRECT_URI ? 'set' : 'unset'
});

// 定数定義
const BASE_URL = (process.env.BASE_URL || 'https://aivis-chan-bot.com').replace(/\/$/, '');
const PATREON_CLIENT_ID = process.env.PATREON_CLIENT_ID || '';
const PATREON_CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET || '';
const PATREON_REDIRECT_URI = process.env.PATREON_REDIRECT_URI || `${BASE_URL}/auth/patreon/callback`;
const PATREON_LINKS_FILE = process.env.PATREON_LINKS_FILE || path.join('/tmp', 'data', 'patreon_links.json');

console.log('[PATREON] Config:', {
  CLIENT_ID: PATREON_CLIENT_ID ? 'set' : 'NOT SET',
  CLIENT_SECRET: PATREON_CLIENT_SECRET ? 'set' : 'NOT SET',
  REDIRECT_URI: PATREON_REDIRECT_URI,
  REDIRECT_PATH: '/auth/patreon/callback'
});

// Bot インスタンス設定
const BOT_INSTANCES = [
  { name: '1st', url: 'http://aivis-chan-bot-1st.aivis-chan-bot.svc.cluster.local:3002', version: 'free' },
  { name: '2nd', url: 'http://aivis-chan-bot-2nd.aivis-chan-bot.svc.cluster.local:3003', version: 'both' },
  { name: '3rd', url: 'http://aivis-chan-bot-3rd.aivis-chan-bot.svc.cluster.local:3004', version: 'both' },
  { name: '4th', url: 'http://aivis-chan-bot-4th.aivis-chan-bot.svc.cluster.local:3005', version: 'both' },
  { name: '5th', url: 'http://aivis-chan-bot-5th.aivis-chan-bot.svc.cluster.local:3006', version: 'both' },
  { name: '6th', url: 'http://aivis-chan-bot-6th.aivis-chan-bot.svc.cluster.local:3007', version: 'both' },
  { name: 'pro-premium', url: 'http://aivis-chan-bot-pro-premium.aivis-chan-bot.svc.cluster.local:3012', version: 'pro' }
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
        timeout: 10000 
      }),
      axios.get('https://discord.com/api/users/@me/guilds', { 
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000
      })
    ]);
    
    if (userResp.status === 200) {
      const userData = userResp.data;
      
      if (userData.avatar) {
        const isAnimated = userData.avatar.startsWith('a_');
        const extension = isAnimated ? 'gif' : 'png';
        profile.avatarUrl = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${extension}?size=256`;
        profile.avatar = userData.avatar;
      } else {
        const defaultAvatarIndex = userData.discriminator === '0' 
          ? (parseInt(userData.id) >> 22) % 6 
          : parseInt(userData.discriminator) % 5;
        profile.avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
        profile.avatar = null;
      }
      
      profile.id = userData.id;
      profile.username = userData.username;
      profile.nickname = userData.global_name || userData.username;
      profile.discriminator = userData.discriminator;
      profile.email = userData.email || null;
      
      console.log(`[passport][${version}] User profile enriched:`, {
        id: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl
      });
    }
    
    if (guildsResp.status === 200) {
      profile.guilds = guildsResp.data.map(guild => {
        const permissions = BigInt(guild.permissions || '0');
        const hasManageGuild = (permissions & BigInt(0x20)) !== BigInt(0);
        const hasAdministrator = (permissions & BigInt(0x8)) !== BigInt(0);
        const isOwner = guild.owner === true;
        
        let iconUrl = null;
        if (guild.icon) {
          const isAnimated = guild.icon.startsWith('a_');
          const extension = isAnimated ? 'gif' : 'png';
          iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${extension}?size=128`;
        }
        
        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          iconUrl,
          owner: isOwner,
          permissions: guild.permissions,
          hasManageGuild,
          hasAdministrator,
          canManage: isOwner || hasManageGuild || hasAdministrator
        };
      });
      
      console.log(`[passport][${version}] Found ${profile.guilds.length} guilds, ${profile.guilds.filter(g => g.canManage).length} manageable`);
    } else {
      profile.guilds = [];
    }
  } catch (e) {
    console.error(`[passport][${version}] failed to enrich profile:`, e.message);
    if (e.response) {
      console.error(`[passport][${version}] Discord API error:`, {
        status: e.response.status,
        data: e.response.data
      });
    }
    profile.guilds = [];
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
      return done(null, enriched);
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
      return done(null, enriched);
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

// JSONパーサー（セッションより前）
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

console.log('[SESSION] cookie settings:', {
  secure: sessionConfig.cookie.secure,
  sameSite: sessionConfig.cookie.sameSite,
  httpOnly: sessionConfig.cookie.httpOnly,
  domain: '(none)',
  name: 'connect.sid',
  proxy: true
});

if (redisStoreInstance) sessionConfig.store = redisStoreInstance;

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// リクエストロガー
app.use((req, res, next) => {
  req.startTime = Date.now();
  const userAgent = req.headers['user-agent']?.substring(0, 100) || 'unknown';
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url} Host:${req.headers.host} UA:${userAgent}`);
  next();
});

// SEO: ダッシュボードにnoindexタグ
app.use((req, res, next) => {
  const urlPath = req.url || req.path || '';
  if (urlPath === '/dashboard' || urlPath.startsWith('/dashboard')) {
    res.set('X-Robots-Tag', 'noindex');
  }
  next();
});

// 静的ファイル
app.use(express.static(__dirname));

// ===== API ルート =====

// サーバー一覧取得
app.get('/api/guilds', requireAuth, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[API /api/guilds][${requestId}] ========== START ==========`);
  console.log(`[API /api/guilds][${requestId}] Request received at ${new Date().toISOString()}`);
  console.log(`[API /api/guilds][${requestId}] isAuthenticated: ${req.isAuthenticated()}`);
  console.log(`[API /api/guilds][${requestId}] req.user:`, JSON.stringify({
    id: req.user?.id,
    username: req.user?.username,
    version: req.user?.version,
    hasGuilds: !!req.user?.guilds,
    guildsCount: req.user?.guilds?.length
  }, null, 2));

  if (!req.user || !req.user.guilds) {
    console.warn(`[API /api/guilds][${requestId}] No guilds in session`);
    return res.json([]);
  }

  console.log(`[API /api/guilds][${requestId}] Total user guilds: ${req.user.guilds.length}`);
  
  // ユーザーのギルドの一部をログ出力（デバッグ用）
  if (req.user.guilds.length > 0) {
    console.log(`[API /api/guilds][${requestId}] Sample user guilds (first 3):`, 
      JSON.stringify(req.user.guilds.slice(0, 3).map(g => ({
        id: g.id,
        name: g.name,
        permissions: g.permissions
      })), null, 2)
    );
  }

  // 管理権限を持つギルドのみフィルタ (MANAGE_GUILD = 0x20, ADMINISTRATOR = 0x8)
  const manageableGuilds = req.user.guilds.filter(g => {
    const perms = parseInt(g.permissions);
    const hasManageGuild = (perms & 0x20) === 0x20;
    const hasAdmin = (perms & 0x8) === 0x8;
    return hasManageGuild || hasAdmin;
  });

  console.log(`[API /api/guilds][${requestId}] Manageable guilds: ${manageableGuilds.length}`);
  
  if (manageableGuilds.length > 0) {
    console.log(`[API /api/guilds][${requestId}] Sample manageable guilds (first 3):`,
      JSON.stringify(manageableGuilds.slice(0, 3).map(g => ({
        id: g.id,
        name: g.name
      })), null, 2)
    );
  }

  // ユーザーのバージョンに応じてBotを選択
  const userVersion = req.user.version || 'free';
  console.log(`[API /api/guilds][${requestId}] User version: ${userVersion}`);
  
  const relevantBots = BOT_INSTANCES.filter(bot => {
    // 'both'は両方のバージョンで使用可能
    if (bot.version === 'both') {
      return true;
    }
    // Free版ユーザーはfreeのみ
    if (userVersion === 'free') {
      return bot.version === 'free';
    }
    // Pro版ユーザーはproとpremium
    return bot.version === 'pro' || bot.version === 'premium';
  });

  console.log(`[API /api/guilds][${requestId}] Relevant bots: ${relevantBots.length}`);
  console.log(`[API /api/guilds][${requestId}] Bot list:`, 
    JSON.stringify(relevantBots.map(b => ({
      name: b.name,
      version: b.version,
      url: b.url
    })), null, 2)
  );

  // 全Bot情報を取得
  const botInfoPromises = relevantBots.map(async bot => {
    const url = `${bot.url}/internal/info`;
    console.log(`[API /api/guilds][${requestId}] Fetching from ${bot.name}: ${url}`);
    
    try {
      const response = await axios.get(url, { 
        timeout: 5000,
        headers: { 'User-Agent': 'Dashboard/1.0' }
      });
      
      const guildIds = response.data.guildIds || [];
      const ready = response.data.ready || false;
      
      console.log(`[API /api/guilds][${requestId}] ${bot.name} - Status: ${response.status}, Ready: ${ready}, Guilds: ${guildIds.length}`);
      
      if (guildIds.length > 0) {
        console.log(`[API /api/guilds][${requestId}] ${bot.name} - Sample guild IDs (first 5):`, 
          guildIds.slice(0, 5)
        );
      }
      
      return {
        ...bot,
        guildIds,
        ready,
        botId: response.data.botId,
        botTag: response.data.botTag,
        serverCount: response.data.serverCount || 0
      };
    } catch (error) {
      console.error(`[API /api/guilds][${requestId}] ${bot.name} - Error: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.error(`[API /api/guilds][${requestId}] ${bot.name} - Connection refused. Bot may be offline.`);
      } else if (error.code === 'ETIMEDOUT') {
        console.error(`[API /api/guilds][${requestId}] ${bot.name} - Connection timeout.`);
      }
      return {
        ...bot,
        guildIds: [],
        ready: false,
        error: error.message
      };
    }
  });

  const botResults = await Promise.all(botInfoPromises);
  const successfulBots = botResults.filter(bot => bot.ready);

  // Botが参加しているギルドIDのセット
  const botGuildIdSet = new Set();
  botResults.forEach(bot => {
    if (bot.guildIds && Array.isArray(bot.guildIds)) {
      bot.guildIds.forEach(id => botGuildIdSet.add(id));
    }
  });

  console.log(`[API /api/guilds][${requestId}] Bot results summary:`);
  console.log(`[API /api/guilds][${requestId}] - Total bots checked: ${relevantBots.length}`);
  console.log(`[API /api/guilds][${requestId}] - Successful bots: ${successfulBots.length}`);
  console.log(`[API /api/guilds][${requestId}] - Failed bots: ${relevantBots.length - successfulBots.length}`);
  console.log(`[API /api/guilds][${requestId}] - Unique bot guild IDs: ${botGuildIdSet.size}`);
  
  if (botGuildIdSet.size > 0) {
    console.log(`[API /api/guilds][${requestId}] - Sample bot guild IDs (first 5):`, 
      Array.from(botGuildIdSet).slice(0, 5)
    );
  }

  if (botGuildIdSet.size === 0) {
    console.warn(`[API /api/guilds][${requestId}] ⚠️  No guilds found in any bot`);
    console.warn(`[API /api/guilds][${requestId}] Bot details:`, 
      JSON.stringify(botResults.map(b => ({
        name: b.name,
        ready: b.ready,
        guildCount: b.guildIds?.length || 0,
        serverCount: b.serverCount || 0,
        error: b.error
      })), null, 2)
    );
  }

  // ユーザーが管理できて、かつBotが参加しているギルドのみ返す
  const filteredGuilds = manageableGuilds.filter(guild => 
    botGuildIdSet.has(guild.id)
  );

  console.log(`[API /api/guilds][${requestId}] Filtered guilds (manageable + bot joined): ${filteredGuilds.length}`);
  
  if (filteredGuilds.length === 0 && manageableGuilds.length > 0 && botGuildIdSet.size > 0) {
    console.warn(`[API /api/guilds][${requestId}] ⚠️  No match between user guilds and bot guilds`);
    console.warn(`[API /api/guilds][${requestId}] Checking overlap...`);
    
    const manageableGuildIds = new Set(manageableGuilds.map(g => g.id));
    const overlap = Array.from(botGuildIdSet).filter(id => manageableGuildIds.has(id));
    
    console.warn(`[API /api/guilds][${requestId}] Overlap count: ${overlap.length}`);
    if (overlap.length > 0) {
      console.warn(`[API /api/guilds][${requestId}] Overlapping guild IDs:`, overlap);
    }
  }

  // 各ギルドにBot情報を追加
  const enrichedGuilds = filteredGuilds.map(guild => {
    const bot = botResults.find(b => 
      b.guildIds && b.guildIds.includes(guild.id)
    );

    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      iconUrl: guild.icon 
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`
        : null,
      owner: guild.owner,
      permissions: guild.permissions,
      botName: bot ? bot.name : null,
      botId: bot ? bot.botId : null,
      botTag: bot ? bot.botTag : null
    };
  });

  console.log(`[API /api/guilds][${requestId}] Returning ${enrichedGuilds.length} guilds`);
  
  if (enrichedGuilds.length > 0) {
    console.log(`[API /api/guilds][${requestId}] Sample enriched guilds (first 3):`,
      JSON.stringify(enrichedGuilds.slice(0, 3).map(g => ({
        id: g.id,
        name: g.name,
        botName: g.botName
      })), null, 2)
    );
  }
  
  console.log(`[API /api/guilds][${requestId}] ========== END ==========`);

  res.json(enrichedGuilds);
});

// 個別ギルド情報取得（チャンネル一覧など）
app.get('/api/guilds/:guildId', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`[API /api/guilds/:guildId][${requestId}] ========== START ==========`);
  console.log(`[API /api/guilds/:guildId][${requestId}] Request for guild: ${guildId}`);
  console.log(`[API /api/guilds/:guildId][${requestId}] User: ${req.user?.id}`);

  if (!req.user || !req.user.guilds) {
    console.warn(`[API /api/guilds/:guildId][${requestId}] User not authenticated or no guilds`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ユーザーが管理権限を持っているか確認
  const userGuild = req.user.guilds.find(g => g.id === guildId);
  if (!userGuild) {
    console.warn(`[API /api/guilds/:guildId][${requestId}] Guild ${guildId} not found in user guilds`);
    return res.status(404).json({ error: 'guild-not-found' });
  }

  const hasPermission = (parseInt(userGuild.permissions) & 0x20) === 0x20 || 
                        (parseInt(userGuild.permissions) & 0x8) === 0x8;

  if (!hasPermission) {
    console.warn(`[API /api/guilds/:guildId][${requestId}] User lacks permission for guild ${guildId}`);
    return res.status(403).json({ error: 'insufficient-permissions' });
  }

  console.log(`[API /api/guilds/:guildId][${requestId}] User has permission for guild ${guildId}`);

  // ユーザーのバージョンに応じてBotを選択
  const userVersion = req.user.version || 'free';
  const relevantBots = BOT_INSTANCES.filter(bot => {
    if (bot.version === 'both') return true;
    if (userVersion === 'free') return bot.version === 'free';
    return bot.version === 'pro' || bot.version === 'premium';
  });

  console.log(`[API /api/guilds/:guildId][${requestId}] Checking ${relevantBots.length} bots for guild ${guildId}`);

  // どのBotがこのギルドに参加しているか確認
  let targetBot = null;
  let botInfo = null;

  for (const bot of relevantBots) {
    try {
      console.log(`[API /api/guilds/:guildId][${requestId}] Checking bot: ${bot.name}`);
      
      const infoResp = await axios.get(`${bot.url}/internal/info`, { 
        timeout: 5000,
        headers: { 'User-Agent': 'Dashboard/1.0' }
      });
      
      const guildIds = infoResp.data.guildIds || [];
      console.log(`[API /api/guilds/:guildId][${requestId}] ${bot.name} has ${guildIds.length} guilds`);
      
      if (guildIds.includes(guildId)) {
        targetBot = bot;
        botInfo = infoResp.data;
        console.log(`[API /api/guilds/:guildId][${requestId}] ✅ Found bot: ${bot.name}`);
        break;
      }
    } catch (error) {
      console.error(`[API /api/guilds/:guildId][${requestId}] Error checking bot ${bot.name}:`, error.message);
    }
  }

  if (!targetBot) {
    console.warn(`[API /api/guilds/:guildId][${requestId}] ❌ No bot found for guild ${guildId}`);
    return res.status(404).json({ 
      error: 'bot-not-found-for-guild',
      message: 'このサーバーにBotが参加していません'
    });
  }

  console.log(`[API /api/guilds/:guildId][${requestId}] Found bot: ${targetBot.name} for guild ${guildId}`);

  // Botからギルド情報を取得
  try {
    console.log(`[API /api/guilds/:guildId][${requestId}] Fetching guild info from: ${targetBot.url}/internal/guilds/${guildId}`);
    
    const guildInfoResp = await axios.get(`${targetBot.url}/internal/guilds/${guildId}`, {
      timeout: 5000,
      headers: { 'User-Agent': 'Dashboard/1.0' }
    });

    console.log(`[API /api/guilds/:guildId][${requestId}] Guild info response status: ${guildInfoResp.status}`);
    
    const guildData = guildInfoResp.data;
    
    // レスポンス形式を統一
    const response = {
      id: guildId,
      name: guildData.name || userGuild.name,
      icon: userGuild.icon,
      iconUrl: userGuild.icon 
        ? `https://cdn.discordapp.com/icons/${guildId}/${userGuild.icon}.png?size=256`
        : null,
      channels: Array.isArray(guildData.channels) ? guildData.channels : [],
      roles: Array.isArray(guildData.roles) ? guildData.roles : [],
      memberCount: guildData.memberCount || null,
      region: guildData.region || null,
      botName: targetBot.name,
      botId: botInfo?.botId || guildData.botId,
      botTag: botInfo?.botTag
    };

    console.log(`[API /api/guilds/:guildId][${requestId}] Response summary:`, {
      id: response.id,
      name: response.name,
      channelsCount: response.channels.length,
      rolesCount: response.roles.length,
      botName: response.botName
    });
    
    console.log(`[API /api/guilds/:guildId][${requestId}] ========== END ==========`);

    res.json(response);

  } catch (error) {
    console.error(`[API /api/guilds/:guildId][${requestId}] Error fetching guild info:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    console.log(`[API /api/guilds/:guildId][${requestId}] ========== END (ERROR) ==========`);
    
    // より詳細なエラーレスポンス
    const errorResponse = {
      error: 'failed-to-fetch-guild-info',
      message: error.message,
      details: error.response?.data || null,
      botName: targetBot?.name,
      guildId: guildId
    };
    
    res.status(error.response?.status || 500).json(errorResponse);
  }
});

// ギルド設定取得
app.get('/api/guilds/:guildId/settings', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  
  console.log(`[API /api/guilds/:guildId/settings] Request for guild: ${guildId}`);
  
  try {
    const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'settings.json');
    
    try {
      const data = await fsPromises.readFile(settingsPath, 'utf8');
      console.log(`[API /api/guilds/:guildId/settings] Settings found for guild: ${guildId}`);
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[API /api/guilds/:guildId/settings] No settings file for guild: ${guildId}, returning defaults`);
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

// ギルド設定更新
app.post('/api/guilds/:guildId/settings', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const settings = req.body;
  
  try {
    const settingsPath = path.join(__dirname, 'data', 'guilds', guildId, 'settings.json');
    await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });
    await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    
    res.json({ success: true, message: 'Settings updated' });
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

// 個人設定保存
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

// 辞書保存
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

// Bot間通信受信
app.post('/api/receive', (req, res) => {
  console.log('[API /api/receive] Received data from bot');
  res.json({ success: true, message: 'Data received' });
});

// セッション情報取得
app.get('/api/session', (req, res) => {
  console.log('[DEBUG] /api/session called');
  console.log('[DEBUG] isAuthenticated:', req.isAuthenticated ? req.isAuthenticated() : false);
  console.log('[DEBUG] req.user:', req.user ? { 
    id: req.user.id, 
    username: req.user.username, 
    guilds: req.user.guilds?.length 
  } : null);
  console.log('[DEBUG] sessionID:', req.sessionID);
  console.log('[DEBUG] session.cookie:', req.session?.cookie);
  console.log('[DEBUG] cookies from request:', Object.keys(req.cookies || {}));
  
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username || req.user.nickname,
        discriminator: req.user.discriminator,
        avatar: req.user.avatarUrl || req.user.avatar,
        avatarUrl: req.user.avatarUrl,
        version: req.user.version,
        guildsCount: req.user.guilds?.length || 0
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ===== 認証ルート =====

app.get('/login', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/auth/discord/:version', (req, res, next) => {
  const version = req.params.version || 'free';
  const strategy = `discord-${version}`;
  
  if (!passport._strategies[strategy]) {
    return res.status(500).send(`${strategy} not configured`);
  }
  
  return passport.authenticate(strategy)(req, res, next);
});

app.get('/auth/discord/callback/:version', (req, res, next) => {
  const version = req.params.version || 'free';
  const strategy = `discord-${version}`;
  
  if (!passport._strategies[strategy]) {
    console.warn('[AUTH] strategy not available:', strategy);
    return res.redirect('/login');
  }

  passport.authenticate(strategy, { session: true }, (err, user) => {
    if (err) {
      console.error('[AUTH] Error:', err);
      return res.status(500).send('authentication error');
    }
    if (!user) {
      console.warn('[AUTH] No user returned');
      return res.redirect('/login');
    }
    
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('[AUTH] Login failed:', loginErr);
        return res.status(500).send('login failed');
      }
      
      if (req.session) {
        req.session.save((saveErr) => {
          if (saveErr) console.warn('[SESSION] Save failed:', saveErr);
          return res.redirect(`/dashboard?version=${version}`);
        });
      } else {
        return res.redirect(`/dashboard?version=${version}`);
      }
    });
  })(req, res, next);
});

app.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) console.error('Logout error:', err);
    req.session?.destroy(() => {
      res.clearCookie('connect.sid');
      return res.redirect('/login');
    });
  });
});

// ===== Patreon認証 =====

if (PATREON_CLIENT_ID && PATREON_CLIENT_SECRET) {
  console.log('[PATREON] OAuth routes enabled');
  
  // Patreon認証開始
  app.get('/auth/patreon', requireAuth, (req, res) => {
    console.log('[PATREON] Auth request from user:', req.user?.id);
    
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
    
    console.log('[PATREON] Redirecting to:', authUrl);
    res.redirect(authUrl);
  });

  // Patreonコールバック
  app.get('/auth/patreon/callback', requireAuth, async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    console.log('[PATREON] Callback received:', {
      hasCode: !!code,
      hasState: !!state,
      error,
      userId: req.user?.id
    });
    
    if (error) {
      console.error('[PATREON] OAuth error:', error, error_description);
      return res.redirect('/dashboard?error=patreon_auth_failed&message=' + encodeURIComponent(error_description || error));
    }
    
    if (!code) {
      console.error('[PATREON] No authorization code received');
      return res.redirect('/dashboard?error=patreon_no_code');
    }
    
    try {
      // stateの検証
      let stateData = {};
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('[PATREON] State decoded:', stateData);
        
        if (stateData.userId !== req.user?.id) {
          console.error('[PATREON] State userId mismatch:', {
            expected: req.user?.id,
            got: stateData.userId
          });
          return res.redirect('/dashboard?error=patreon_state_mismatch');
        }
      } catch (e) {
        console.error('[PATREON] Failed to decode state:', e.message);
        return res.redirect('/dashboard?error=patreon_invalid_state');
      }
      
      // アクセストークン取得
      console.log('[PATREON] Exchanging code for access token...');
      const tokenResponse = await axios.post('https://www.patreon.com/api/oauth2/token', {
        code,
        grant_type: 'authorization_code',
        client_id: PATREON_CLIENT_ID,
        client_secret: PATREON_CLIENT_SECRET,
        redirect_uri: PATREON_REDIRECT_URI
      }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      
      console.log('[PATREON] Token response status:', tokenResponse.status);
      const accessToken = tokenResponse.data.access_token;
      const refreshToken = tokenResponse.data.refresh_token;
      
      if (!accessToken) {
        console.error('[PATREON] No access token in response');
        return res.redirect('/dashboard?error=patreon_no_token');
      }
      
      // ユーザー情報取得
      console.log('[PATREON] Fetching user identity...');
      const userResponse = await axios.get('https://www.patreon.com/api/oauth2/v2/identity', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          'include': 'memberships,memberships.campaign',
          'fields[user]': 'email,full_name,vanity,image_url',
          'fields[member]': 'patron_status,currently_entitled_amount_cents,lifetime_support_cents,pledge_relationship_start',
          'fields[campaign]': 'vanity,creation_name'
        },
        timeout: 10000
      });
      
      console.log('[PATREON] User response status:', userResponse.status);
      const userData = userResponse.data.data;
      const includedData = userResponse.data.included || [];
      
      // メンバーシップ情報を抽出
      const memberships = includedData
        .filter(item => item.type === 'member')
        .map(member => ({
          patron_status: member.attributes.patron_status,
          currently_entitled_amount_cents: member.attributes.currently_entitled_amount_cents,
          lifetime_support_cents: member.attributes.lifetime_support_cents,
          pledge_relationship_start: member.attributes.pledge_relationship_start
        }));
      
      console.log('[PATREON] Memberships found:', memberships.length);
      
      // Patreonデータを保存
      const patreonData = {
        patreon_id: userData.id,
        discord_id: req.user?.id,
        email: userData.attributes.email,
        full_name: userData.attributes.full_name,
        vanity: userData.attributes.vanity,
        image_url: userData.attributes.image_url,
        memberships: memberships,
        access_token: accessToken,
        refresh_token: refreshToken,
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log('[PATREON] Saving data for user:', {
        patreon_id: patreonData.patreon_id,
        discord_id: patreonData.discord_id,
        memberships_count: memberships.length
      });
      
      // ファイルに保存
      await fsPromises.mkdir(path.dirname(PATREON_LINKS_FILE), { recursive: true });
      
      let existingLinks = [];
      try {
        const data = await fsPromises.readFile(PATREON_LINKS_FILE, 'utf8');
        existingLinks = JSON.parse(data);
        console.log('[PATREON] Loaded existing links:', existingLinks.length);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('[PATREON] Creating new links file');
        } else {
          console.warn('[PATREON] Failed to read existing links:', error.message);
        }
      }
      
      // 既存データを更新または追加
      const index = existingLinks.findIndex(link => link.discord_id === req.user?.id);
      if (index >= 0) {
        console.log('[PATREON] Updating existing link at index:', index);
        existingLinks[index] = patreonData;
      } else {
        console.log('[PATREON] Adding new link');
        existingLinks.push(patreonData);
      }
      
      await fsPromises.writeFile(PATREON_LINKS_FILE, JSON.stringify(existingLinks, null, 2));
      console.log('[PATREON] Data saved successfully');
      
      // 全Botに通知
      console.log('[PATREON] Notifying bots...');
      await Promise.allSettled(
        BOT_INSTANCES.map(bot => 
          axios.post(`${bot.url}/api/patreon/notify`,
            { discord_id: req.user?.id, patreon_data: patreonData },
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
          ).then(() => {
            console.log(`[PATREON] Notified ${bot.name}`);
          }).catch(err => {
            console.log(`[PATREON] Failed to notify ${bot.name}: ${err.message}`);
          })
        )
      );
      
      res.redirect('/dashboard?patreon=linked&status=success');
    } catch (error) {
      console.error('[PATREON] Auth error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
      });
      
      const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
      res.redirect('/dashboard?error=patreon_link_failed&message=' + encodeURIComponent(errorMessage));
    }
  });
  
  // Patreon連携解除
  app.post('/api/patreon/unlink', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      console.log('[PATREON] Unlinking for user:', userId);
      
      // ファイルから削除
      let existingLinks = [];
      try {
        const data = await fsPromises.readFile(PATREON_LINKS_FILE, 'utf8');
        existingLinks = JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.json({ success: true, message: 'No link found' });
        }
        throw error;
      }
      
      const filteredLinks = existingLinks.filter(link => link.discord_id !== userId);
      
      if (filteredLinks.length === existingLinks.length) {
        console.log('[PATREON] No link found to remove');
        return res.json({ success: true, message: 'No link found' });
      }
      
      await fsPromises.writeFile(PATREON_LINKS_FILE, JSON.stringify(filteredLinks, null, 2));
      console.log('[PATREON] Link removed successfully');
      
      // 全Botに通知
      await Promise.allSettled(
        BOT_INSTANCES.map(bot => 
          axios.post(`${bot.url}/api/patreon/unlink`,
            { discord_id: userId },
            { headers: { 'Content-Type': 'application/json' }, timeout: 5000 }
          ).catch(err => console.log(`Failed to notify ${bot.name}: ${err.message}`))
        )
      );
      
      res.json({ success: true, message: 'Patreon unlinked successfully' });
    } catch (error) {
      console.error('[PATREON] Unlink error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Patreon連携状態確認
  app.get('/api/patreon/status', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      
      let existingLinks = [];
      try {
        const data = await fsPromises.readFile(PATREON_LINKS_FILE, 'utf8');
        existingLinks = JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.json({ linked: false });
        }
        throw error;
      }
      
      const userLink = existingLinks.find(link => link.discord_id === userId);
      
      if (!userLink) {
        return res.json({ linked: false });
      }
      
      res.json({
        linked: true,
        patreon_id: userLink.patreon_id,
        full_name: userLink.full_name,
        vanity: userLink.vanity,
        image_url: userLink.image_url,
        memberships: userLink.memberships,
        linked_at: userLink.linked_at,
        updated_at: userLink.updated_at
      });
    } catch (error) {
      console.error('[PATREON] Status check error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
} else {
  console.log('[PATREON] OAuth not configured - routes disabled');
  
  app.get('/auth/patreon', (req, res) => {
    res.status(503).send('Patreon integration not configured');
  });
  
  app.get('/auth/patreon/callback', (req, res) => {
    res.status(503).send('Patreon integration not configured');
  });
}

// ===== ページルート =====

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ダッシュボード（versionパラメータ必須）
app.get('/dashboard', requireAuth, (req, res) => {
  const version = req.query.version;
  const userVersion = req.user?.version;
  
  console.log('[DASHBOARD] Access attempt:', {
    queryVersion: version,
    userVersion: userVersion,
    userId: req.user?.id
  });
  
  // versionパラメータがない場合
  if (!version) {
    console.log('[DASHBOARD] No version parameter, redirecting to login');
    return res.redirect(`/login?error=missing_version&message=${encodeURIComponent('バージョンパラメータが必要です')}`);
  }
  
  // 無効なversionパラメータ
  if (version !== 'free' && version !== 'pro') {
    console.log('[DASHBOARD] Invalid version parameter:', version);
    return res.redirect(`/login?error=invalid_version&message=${encodeURIComponent('無効なバージョンです')}`);
  }
  
  // ユーザーのログインバージョンと一致しない場合
  if (userVersion && userVersion !== version) {
    console.log('[DASHBOARD] Version mismatch:', {
      expected: version,
      actual: userVersion
    });
    return res.redirect(`/login?error=version_mismatch&message=${encodeURIComponent('認証バージョンが一致しません')}`);
  }
  
  console.log('[DASHBOARD] Access granted for version:', version);
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ===== サーバー起動 =====

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`[LISTEN] app listening on ${HOST}:${PORT} (PID ${process.pid})`);
  });
}

module.exports = app;