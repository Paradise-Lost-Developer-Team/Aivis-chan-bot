# Aivis-chan Bot 公式Webサイト

6台のAivis-chan Botの統合管理・ステータス監視・招待リンク提供を行う公式Webサイトです。

## 🤖 Bot構成

### メインBot群
1. **Aivis-chan-bot (Main)** - `1333819940645638154`
   - 高品質音声合成（AivisSpeech Engine）
   - 基本的なDiscord Bot機能

2. **Aivis-chan-bot-2nd** - `1334732369831268352`
   - 音声合成機能の拡張
   - 負荷分散対応

3. **Aivis-chan-bot-3rd** - `1334734681656262770`
   - 音楽再生機能
   - プレイリスト管理

4. **Aivis-chan-bot-4th** - `1365633502988472352`
   - ユーティリティ機能
   - サーバー管理支援

5. **Aivis-chan-bot-5th** - `1365633586123771934`
   - モデレーション機能
   - 自動管理システム

6. **Aivis-chan-bot-6th** - `1365633656173101086`
   - アナリティクス・統計
   - パフォーマンス監視

## 🌟 主要機能

### 📊 リアルタイム統計監視
- 6台Bot統合サーバー数・ユーザー数表示
- 個別Botステータス確認
- 稼働率とパフォーマンス監視
- 3分間隔での自動更新

### 🎯 Bot招待システム
- 各Bot個別の招待リンク生成
- 適切な権限設定（`3148800`）
- ワンクリックBot ID コピー機能

### � Patreon統合
- **Pro プラン**: ¥500/月
- **Premium プラン**: ¥1,000/月
- 機能制限解除とプライオリティサポート

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

## 🔐 Discord認証設定

ダッシュボードにアクセスするにはDiscord認証が必要です。以下の手順で設定してください。

### 1. Discordアプリケーションの作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. "New Application" をクリック
3. アプリケーション名を入力（例: "Aivis-chan Bot Dashboard"）
4. 作成されたアプリケーションの "General Information" から **Application ID** をコピー

### 2. OAuth2設定

1. 左側のメニューから "OAuth2" → "General" を選択
2. **Client Secret** を生成してコピー
3. "OAuth2" → "URL Generator" を選択
4. Scopesで `bot` と `identify` を選択
5. Bot Permissionsで必要な権限を選択
6. 生成されたURLをコピー

### 3. 環境変数の設定

`.env` ファイルに以下の変数を設定：

```bash
# Discord OAuth2 Configuration
DISCORD_CLIENT_ID=your_discord_application_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
DISCORD_REDIRECT_URI=https://your-domain.com/auth/discord/callback
SESSION_SECRET=your_random_session_secret_here
```

### 4. リダイレクトURIの設定

Discord Developer Portalの "OAuth2" → "General" で以下のリダイレクトURIを追加：
- `https://your-domain.com/auth/discord/callback`

### 5. 依存関係のインストール

```bash
npm install express-session passport passport-discord
```

### 6. サーバーの再起動

環境変数を設定したらサーバーを再起動してください。

```bash
npm start
# または
node server.js
```

### 7. アクセス方法

1. ブラウザで `https://your-domain.com/dashboard` にアクセス
2. Discordログイン画面が表示される
3. Discordアカウントでログイン
4. ダッシュボードにアクセス可能

## 📋 必要な権限

ダッシュボード機能を使用するには、以下のDiscord権限が必要です：

- `identify` - ユーザー情報の取得
- `guilds` - サーバー情報の取得（オプション）

## 🔒 セキュリティ注意事項

- `SESSION_SECRET` は強力なランダム文字列を使用してください
- 本番環境ではHTTPSを使用してください
- 定期的にClient Secretを更新することを推奨します

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

## 🔄 Webサイト更新方法

### クイック更新（推奨）
```powershell
# PowerShell でクイック更新
.\quick-update.ps1 -UpdateType css    # CSSのみ更新
.\quick-update.ps1 -UpdateType js     # JavaScriptのみ更新  
.\quick-update.ps1 -UpdateType html   # HTMLのみ更新
.\quick-update.ps1 -UpdateType all    # 全ファイル更新
```

### 完全アップロード
```bash
# 更新前チェック
chmod +x check-update.sh upload.sh
./check-update.sh

# 全ファイルアップロード  
./upload.sh
```

### 手動更新
```bash
# 個別ファイル更新
scp index.html root@alecjp02.asuscomm.com:/srv/www/htdocs/aivis-chan-bot.com/
scp css/main.css root@alecjp02.asuscomm.com:/srv/www/htdocs/aivis-chan-bot.com/css/
scp js/main.js root@alecjp02.asuscomm.com:/srv/www/htdocs/aivis-chan-bot.com/js/
```

詳細な更新手順は [UPDATE_GUIDE.md](UPDATE_GUIDE.md) を参照してください。

## サポート

- [サポートサーバー](https://discord.gg/MPx2ny8HXT)
- [GitHub Issues](https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot/issues)
- [公式ドキュメント](https://paradise-lost-developer-team.github.io/Aivis-chan-bot/)
