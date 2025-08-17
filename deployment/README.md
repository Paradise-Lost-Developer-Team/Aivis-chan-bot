# Aivis-chan Bot Configuration (6 Bots Setup)

## 設定ファイルのセットアップ

### 1. ConfigMapの準備

6台のBotそれぞれに個別のTOKENが必要です。以下の設定ファイルを編集してください：

```bash
# 実際の設定ファイルをコピー
cp config-configmap-example.yaml config-configmap.yaml
```

### 2. 各Botの設定値更新

`config-configmap.yaml`ファイルを編集し、**各Bot（1st～6th）ごとに異なるTOKEN**を設定してください：

**各Botで必要な個別設定:**
- `TOKEN`: 各Botごとに異なるDiscordボットトークン
  - Bot 1st: `YOUR_DISCORD_BOT_1ST_TOKEN_HERE`
  - Bot 2nd: `YOUR_DISCORD_BOT_2ND_TOKEN_HERE`
  - Bot 3rd: `YOUR_DISCORD_BOT_3RD_TOKEN_HERE`
  - Bot 4th: `YOUR_DISCORD_BOT_4TH_TOKEN_HERE`
  - Bot 5th: `YOUR_DISCORD_BOT_5TH_TOKEN_HERE`
  - Bot 6th: `YOUR_DISCORD_BOT_6TH_TOKEN_HERE`

**共通設定:**
- `clientId`: DiscordアプリケーションのクライアントID（全Bot共通可能）

**Patreon設定:**
- `PATREON.CLIENT_ID`: PatreonのクライアントID
- `PATREON.CLIENT_SECRET`: Patreonのクライアントシークレット
- `PATREON.REDIRECT_URI`: PatreonのリダイレクトURI

**Gemini AI設定:**
- `GEMINI_SERVICE_ACCOUNT_PATH`: Google Cloud サービスアカウントのJSONファイルパス
- `GEMINI_PROJECT_ID`: Google CloudプロジェクトID
- `GEMINI_LOCATION`: Gemini APIのリージョン（デフォルト: us-central1）

**Sentry設定（エラー監視）:**
- `sentry.dsn`: SentryのDSN URL

**その他の機密情報:**
- `config-secrets.json`内の各種トークンとアクセスキー

### 3. デプロイ

```bash
# ConfigMapを適用
kubectl apply -f config-configmap.yaml

# Botをデプロイ
kubectl apply -f aivis-chan-bot.yaml
```

### 4. セキュリティ注意事項

- `config-configmap.yaml`は機密情報を含むため、**絶対にコミットしないでください**
- `.gitignore`に`**/config-configmap.yaml`が追加されています
- `config-configmap-example.yaml`のみをテンプレートとしてコミットしてください

### 5. ログ確認

```bash
# Podの状態確認
kubectl get pods -l app=aivis-chan-bot-1st

# ログ確認
kubectl logs -f deployment/aivis-chan-bot-1st
```
