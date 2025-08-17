const http = require('http');
const express = require('express');

const app = express();


// ルートエンドポイント
app.get('/', (req, res) => {
    res.send('Hello HTTPS Server!');
});

// HTTPサーバー起動（IngressでTLS終端するためアプリはhttpでOK）
const PORT = process.env.PORT || 3000;
http.createServer(app).listen(PORT, () => {
    console.log(`HTTP Server running on port ${PORT}`);
});