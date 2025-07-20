# Aivis-chan Bot API Server

本物のDiscord Bot統計情報を提供するAPIサーバーです。

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成し、各Discord BotのトークンW設定してください：

```bash
cp .env.example .env
```

`.env`ファイルを編集して、実際のBotトークンを設定：

```env
BOT_TOKEN_1=YOUR_ACTUAL_BOT_TOKEN_1
BOT_TOKEN_2=YOUR_ACTUAL_BOT_TOKEN_2
# ... 他のトークンも同様に設定
```

### 3. サーバーの起動

#### 開発環境
```bash
npm run dev
```

#### 本番環境
```bash
npm start
```

## API エンドポイント

### 個別のBot統計情報を取得
```
GET /api/bot-stats/{bot_id}
```

レスポンス例：
```json
{
  "success": true,
  "online": true,
  "server_count": 1250,
  "user_count": 45000,
  "uptime": 99.8,
  "last_updated": "2024-01-15T10:30:00.000Z"
}
```

### 全Bot統計情報を取得
```
GET /api/bot-stats
```

レスポンス例：
```json
{
  "bots": [
    {
      "bot_id": "1333819940645638154",
      "success": true,
      "online": true,
      "server_count": 1250,
      "user_count": 45000,
      "uptime": 99.8
    }
  ],
  "total_bots": 6,
  "online_bots": 6,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### ヘルスチェック
```
GET /health
```

## Discord Bot権限

APIサーバーが正常に動作するために、各Discord Botに以下の権限が必要です：

- **guilds** - サーバー一覧の取得
- **guilds.members.read** - メンバー数の取得

## セキュリティ

- BotトークンF環境変数で管理
- CORS設定で許可されたオリジンからのみアクセス可能
- レート制限の実装を推奨

## デプロイ

### Heroku
```bash
heroku create aivis-bot-api
heroku config:set BOT_TOKEN_1=your_token_here
# 他のトークンも設定
git push heroku main
```

### Docker
```bash
docker build -t aivis-bot-api .
docker run -p 3001:3001 --env-file .env aivis-bot-api
```

## トラブルシューティング

### 401 Unauthorized
- Botトークンが正しく設定されているか確認
- Discord Developer Portalでトークンの有効性を確認

### 403 Forbidden
- BotC必要な権限（guilds, guilds.members.read）があるか確認

### 429 Rate Limited
- Discord APIのレート制限に達した場合は、少し待ってから再試行

## 監視とログ

本番環境では以下の監視を推奨：

- APIレスポンス時間
- エラー率
- Discord API レート制限状況
- サーバーリソース使用量
