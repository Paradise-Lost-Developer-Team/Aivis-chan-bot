# Aivis-chan Bot ステータスページ

Aivis-chan Botのリアルタイムステータスを表示するWebページです。

## 機能

### 🔍 システム監視
- **Discord Bot**: Discord APIとの接続状況
- **TTS Engine**: AivisSpeech Engineの動作状況
- **API サーバー**: 内部APIサーバーの健全性
- **データベース**: データベース接続状況

### 📊 リアルタイム統計
- 参加サーバー数
- 総ユーザー数
- 接続中ボイスチャンネル数
- 今日の読み上げ数

### ⚡ パフォーマンス監視
- Discord API レスポンス時間
- TTS Engine レスポンス時間
- リアルタイムグラフ表示

### 📢 お知らせ・アップデート
- システムメンテナンス情報
- 新機能のお知らせ
- アップデート履歴

## ファイル構成

```
/
├── index.html          # メインHTMLファイル
├── css/
│   └── style.css       # スタイルシート
├── js/
│   ├── status.js       # ステータス監視JavaScript
│   └── api-config.js   # API設定ファイル
├── images/
│   ├── aivis-logo.svg  # ロゴ画像
│   └── favicon.svg     # ファビコン
└── README.md           # このファイル
```

## セットアップ

### 1. 基本設定

1. `js/api-config.js` を編集してAPIエンドポイントを設定
```javascript
const API_CONFIG = {
    baseURL: 'http://your-api-server.com/api', // 実際のAPIサーバーURL
    // ... その他の設定
};
```

2. 開発環境の場合は `DEVELOPMENT_MODE = true` に設定

### 2. APIエンドポイント

ステータスページが期待するAPIエンドポイント：

#### GET /api/bot/status
```json
{
    "status": "online",
    "uptime": 86400000,
    "guilds": 1247,
    "users": 89653,
    "ping": 45,
    "version": "2.1.0"
}
```

#### GET /api/tts/status
```json
{
    "online": true,
    "version": "1.0.0",
    "speakers": 15,
    "queue": 3,
    "processing": true
}
```

#### GET /api/health
```json
{
    "status": "healthy",
    "timestamp": 1642684800000,
    "services": {
        "database": "connected",
        "discord": "connected",
        "tts": "connected"
    }
}
```

#### GET /api/database/status
```json
{
    "connected": true,
    "responseTime": 12,
    "activeConnections": 5,
    "maxConnections": 100
}
```

#### GET /api/statistics
```json
{
    "guilds": 1247,
    "users": 89653,
    "voiceChannels": 23,
    "messagesToday": 4521,
    "totalMessages": 1234567,
    "uptime": 86400000
}
```

### 3. カスタマイズ

#### テーマカラーの変更
`css/style.css` の CSS変数を編集：
```css
:root {
    --primary-color: #3498db;    /* メインカラー */
    --secondary-color: #2ecc71;  /* セカンダリカラー */
    --danger-color: #e74c3c;     /* エラーカラー */
    --warning-color: #f39c12;    /* 警告カラー */
}
```

#### 更新間隔の変更
`js/api-config.js` で設定：
```javascript
updateInterval: 30000, // 30秒間隔
```

#### ロゴ・ファビコンの変更
- `images/aivis-logo.svg`: ヘッダーロゴ
- `images/favicon.svg`: ファビコン

## 使用方法

### 1. 静的ホスティング
GitHub Pages、Netlify、Vercel等でホスティング可能

### 2. ローカル開発
```bash
# シンプルなHTTPサーバーを起動
npx http-server

# または Python
python -m http.server 8000

# または PHP
php -S localhost:8000
```

### 3. 本番環境
- CDN経由でのファイル配信を推奨
- HTTPS必須（Service Worker使用のため）
- APIサーバーとのCORS設定が必要

## 開発

### モック開発
`DEVELOPMENT_MODE = true` の場合、実際のAPIではなくモックデータを使用

### リアルタイム更新
- 30秒間隔での自動更新
- ページフォーカス時の即座更新
- WebSocket対応（将来実装予定）

### エラーハンドリング
- APIエラー時の適切な表示
- ネットワーク障害時の自動リトライ
- タイムアウト処理

## トラブルシューティング

### よくある問題

1. **ステータスが「確認中...」のまま**
   - API設定を確認
   - ネットワーク接続を確認
   - CORS設定を確認

2. **統計が更新されない**
   - APIエンドポイントのレスポンス形式を確認
   - ブラウザの開発者ツールでエラーログを確認

3. **レスポンシブデザインが崩れる**
   - CSS設定を確認
   - ブラウザキャッシュをクリア

## ライセンス

MIT License - Paradise Lost Developer Team

## サポート

- [サポートサーバー](https://discord.gg/MPx2ny8HXT)
- [GitHub Issues](https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot/issues)
- [公式ドキュメント](https://paradise-lost-developer-team.github.io/Aivis-chan-bot/)
