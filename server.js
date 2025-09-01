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
// K8sクラスタ内ならService名でアクセス、ローカルならlocalhost等に変更可
const BOT_API_URLS = {
    main: process.env.BOT_API_URL || 'http://aivis-chan-bot-1st:3002/api/stats',
    second: process.env.BOT_API_URL_2ND || 'http://aivis-chan-bot-2nd:3003/api/stats',
    third: process.env.BOT_API_URL_3RD || 'http://aivis-chan-bot-3rd:3004/api/stats',
    fourth: process.env.BOT_API_URL_4TH || 'http://aivis-chan-bot-4th:3005/api/stats',
    fifth: process.env.BOT_API_URL_5TH || 'http://aivis-chan-bot-5th:3006/api/stats',
    sixth: process.env.BOT_API_URL_6TH || 'http://aivis-chan-bot-6th:3007/api/stats',
};

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