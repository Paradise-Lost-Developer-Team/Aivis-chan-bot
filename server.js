const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;


// 静的ファイル配信（Dockerfileでコピーした全ディレクトリを対象に）
app.use(express.static(__dirname));


// Bot APIから統計データを取得して返すエンドポイント
const axios = require('axios');
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

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});