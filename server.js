const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// 静的ファイル配信（Dockerfileでコピーした全ディレクトリを対象に）
app.use(express.static(__dirname));

// 追加：簡易リクエストロガー（デバッグ用）
app.use((req, res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url} Host:${req.headers.host} UA:${req.headers['user-agent']}`);
  next();
});

// Bot APIから統計データを取得して返すエンドポイント
// デフォルトではクラスタ内部DNS（FQDN）を使うようにする。
// 必要であれば環境変数で個別に上書き可能。
const BOT_NAMESPACE = process.env.BOT_NAMESPACE || 'default';
const CLUSTER_DOMAIN = process.env.CLUSTER_DOMAIN || 'svc.cluster.local';

function clusterUrl(svcName, port) {
  // 例: http://aivis-chan-bot-1st.default.svc.cluster.local:3002/api/stats
  return `http://${svcName}.${BOT_NAMESPACE}.${CLUSTER_DOMAIN}:${port}/api/stats`;
}

const SERVICE_PORT = parseInt('3000', 10);
const BOT_API_URLS = {
  main: process.env.BOT_API_URL || clusterUrl('aivis-chan-bot-1st', SERVICE_PORT),
  second: process.env.BOT_API_URL_2ND || clusterUrl('aivis-chan-bot-2nd', SERVICE_PORT),
  third: process.env.BOT_API_URL_3RD || clusterUrl('aivis-chan-bot-3rd', SERVICE_PORT),
  fourth: process.env.BOT_API_URL_4TH || clusterUrl('aivis-chan-bot-4th', SERVICE_PORT),
  fifth: process.env.BOT_API_URL_5TH || clusterUrl('aivis-chan-bot-5th', SERVICE_PORT),
  sixth: process.env.BOT_API_URL_6TH || clusterUrl('aivis-chan-bot-6th', SERVICE_PORT),
};

// Map known bot IDs (used by frontend) to the internal BOT_API_URLS entries
const BOT_ID_MAP = {
  '1333819940645638154': BOT_API_URLS.main,
  '1334732369831268352': BOT_API_URLS.second,
  '1334734681656262770': BOT_API_URLS.third,
  '1365633502988472352': BOT_API_URLS.fourth,
  '1365633586123771934': BOT_API_URLS.fifth,
  '1365633656173101086': BOT_API_URLS.sixth
};

// API: aggregated bot stats expected by front-end
app.get('/api/bot-stats', async (req, res) => {
  const botEntries = Object.entries(BOT_ID_MAP);
  const axiosTimeout = 7000;

  const results = await Promise.all(botEntries.map(async ([botId, url]) => {
    try {
      const r = await axios.get(url, { timeout: axiosTimeout });
      // ensure returned shape includes bot_id for frontend
      return Object.assign({ bot_id: botId, success: true }, r.data);
    } catch (err) {
      console.warn(`Failed to fetch stats for ${botId} from ${url}:`, err.message);
      return { bot_id: botId, success: false, error: err.message };
    }
  }));

  const total_bots = results.length;
  const online_bots = results.filter(r => r.success && r.online).length;

  return res.json({ bots: results, total_bots, online_bots, timestamp: new Date().toISOString() });
});

// API: single bot stats by botId
app.get('/api/bot-stats/:botId', async (req, res) => {
  const botId = req.params.botId;
  const url = BOT_ID_MAP[botId];
  if (!url) return res.status(404).json({ error: 'unknown bot id' });
  try {
    const r = await axios.get(url, { timeout: 7000 });
    return res.json(Object.assign({ bot_id: botId, success: true }, r.data));
  } catch (err) {
    console.warn(`Failed to fetch stats for ${botId} from ${url}:`, err.message);
    return res.status(502).json({ bot_id: botId, success: false, error: err.message });
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

// ルートはindex.htmlを返す
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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
const PATREON_LINKS_FILE = path.join(__dirname, '..', 'data', 'patreon_links.json');

function ensurePatreonLinksFile() {
  try {
    if (!fs.existsSync(PATREON_LINKS_FILE)) {
      fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify([]));
    }
  } catch (e) { console.error('ensurePatreonLinksFile error', e); }
}

function savePatreonLink(link) {
  try {
    ensurePatreonLinksFile();
    const raw = fs.readFileSync(PATREON_LINKS_FILE, 'utf8');
    const arr = JSON.parse(raw || '[]');
    arr.push(link);
    fs.writeFileSync(PATREON_LINKS_FILE, JSON.stringify(arr, null, 2));
  } catch (e) { console.error('savePatreonLink error', e); }
}

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
  return res.redirect(authUrl);
});

app.get(PATREON_REDIRECT_PATH, async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('missing code or state');
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET) return res.status(500).send('Patreon client not configured');

  try {
    // exchange code for token
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

    // save link: state contains discordId
    const discordId = String(state).split(':')[0];
    savePatreonLink({ discordId, patreonId, tokenData, createdAt: new Date().toISOString() });

    // Optionally notify Discord user via bot API - not implemented here
    return res.send('Patreon linked successfully. You can close this page.');
  } catch (e) {
    console.error('Patreon callback error', e?.response?.data || e.message || e);
    return res.status(500).send('Failed to exchange token');
  }
});
