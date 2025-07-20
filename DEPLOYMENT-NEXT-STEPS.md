# 🎉 .envファイルアップロード完了 - 次のステップ

## ✅ 完了した作業
- ✅ .envファイルをsudo nanoでサーバーにアップロード完了
- ✅ 実際のDiscord Botトークンが設定済み
- ✅ 本番環境用設定に更新
- ✅ ファイル権限設定完了 (wwwrun:wwwrun)
- ✅ .htaccessファイル作成完了
- ✅ セキュリティテスト成功 (404)

## 🔧 サーバー上で実行すべき残りの作業

### 1. **ファイル権限の設定** ✅
```bash
# .envファイルの権限設定（完了）
sudo chmod 600 /var/www/html/api/.env
sudo chown wwwrun:wwwrun /var/www/html/api/.env

# 権限確認
ls -la /var/www/html/api/.env
# 期待結果: -rw------- 1 wwwrun wwwrun [サイズ] [日時] .env
```

### 2. **.htaccessファイルの作成**
```bash
# .htaccessファイル作成（セキュリティ必須）
sudo tee /var/www/html/api/.htaccess << 'EOF'
<Files ".env">
    Require all denied
</Files>

<Files "*.log">
    Require all denied
</Files>

# 環境変数ファイルへのアクセスを完全禁止
<FilesMatch "\.(env|key|pem|log)$">
    Require all denied
</FilesMatch>

# セキュリティヘッダー
Header always set X-Content-Type-Options nosniff
Header always set X-Frame-Options DENY
Header always set X-XSS-Protection "1; mode=block"

# CORS設定
Header always set Access-Control-Allow-Origin "https://aivis-chan-bot.com"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
EOF

# .htaccess権限設定
sudo chmod 644 /var/www/html/api/.htaccess
sudo chown wwwrun:wwwrun /var/www/html/api/.htaccess
```

### 3. **必要なファイルのアップロード**
```bash
# APIサーバーファイル群が存在するか確認
ls -la /var/www/html/api/

# 必要なファイル:
# ✅ .env (完了)
# ✅ .htaccess (上記で作成)
# ❓ bot-stats-server.js
# ❓ package.json
# ❓ package-lock.json (npm installで自動生成)
```

### 4. **Node.js依存関係のインストール**
```bash
# APIディレクトリに移動
cd /var/www/html/api/

# package.jsonが存在する場合
sudo npm install

# package.jsonが存在しない場合、先にアップロードが必要
```

### 5. **PM2でサービス起動**
```bash
# PM2インストール（まだの場合）
sudo npm install -g pm2

# Aivis API サービス起動
pm2 start bot-stats-server.js --name "aivis-api"

# 自動起動設定
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u wwwrun --hp /var/lib/wwwrun
pm2 save

# サービス状況確認
pm2 status
pm2 logs aivis-api
```

### 6. **Apache設定・再起動**
```bash
# Apache設定確認
sudo apache2ctl configtest

# Apache再起動
sudo systemctl restart apache2

# Apache状況確認
sudo systemctl status apache2
```

## 🧪 動作確認テスト

### 1. **セキュリティテスト**
```bash
# .envファイルへの直接アクセスが禁止されているか確認
curl https://your-domain.com/api/.env
# 期待結果: 403 Forbidden または 404 Not Found

# .htaccessが機能しているか確認
curl -I https://your-domain.com/api/.env
# 期待結果: HTTP/1.1 403 Forbidden
```

### 2. **API動作テスト**
```bash
# ヘルスチェック
curl https://your-domain.com/api/health
# 期待結果: {"status":"healthy","timestamp":"...","configured_bots":6}

# 個別Bot統計取得
curl https://your-domain.com/api/bot-stats/1333819940645638154
# 期待結果: {"success":true,"online":true,"server_count":245,...}

# 全Bot統計取得
curl https://your-domain.com/api/bot-stats
# 期待結果: {"bots":[...],"total_bots":6,"online_bots":6,...}
```

### 3. **ウェブサイト表示確認**
```bash
# メインサイトアクセス
curl -I https://your-domain.com/
# 期待結果: HTTP/1.1 200 OK

# ブラウザで確認:
# 1. https://your-domain.com にアクセス
# 2. メインページの統計情報が「API取得中...」から実際の数値に変わるか確認
# 3. ブラウザのデベロッパーツール(F12)でエラーがないか確認
```

## 🚨 まだ必要なファイルのアップロード

### 残りのファイル（WinSCP経由または同様にnano）:
```
1. bot-stats-server.js - APIサーバープログラム
2. package.json - Node.js依存関係定義
3. フロントエンドファイル群:
   - index.html
   - js/main.js
   - js/bot-status.js
   - css/style.css
   - その他リソース
```

## 🎯 次のステップ

### 優先順位:
1. **権限設定** - 最優先（セキュリティ）
2. **.htaccess作成** - 最優先（セキュリティ）
3. **bot-stats-server.js アップロード** - API動作に必須
4. **package.json アップロード** - 依存関係に必須
5. **フロントエンドファイル** - ウェブサイト表示に必須

### 現在の進捗:
```
✅ .env ファイル - 完了
❓ セキュリティ設定 - 要実行
❓ APIサーバー - 要アップロード
❓ フロントエンド - 要アップロード
```

どのステップから始めますか？最初に**権限設定と.htaccess作成**をお勧めします！🚀
