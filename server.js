const https = require('https');
const fs = require('fs');
const express = require('express');

const app = express();

// SSL証明書と秘密鍵のパスを指定
const options = {
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.crt')
};

// ルートエンドポイント
app.get('/', (req, res) => {
    res.send('Hello HTTPS Server!');
});

// HTTPSサーバー起動
const PORT = 443;
https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS Server running on port ${PORT}`);
});