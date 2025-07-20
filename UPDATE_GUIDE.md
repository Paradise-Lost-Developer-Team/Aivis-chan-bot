# Aivis-chan Bot Website 更新手順

## 🔄 更新の流れ

### 1. ローカルでの開発・テスト
```bash
# ローカルサーバーでテスト（Visual Studio Code Live Server推奨）
# または Python HTTP サーバー
python -m http.server 8000
```

### 2. ファイル変更後の確認事項

#### 📝 変更したファイルの確認
- `index.html` - メインWebページ
- `css/main.css` - スタイルシート
- `js/main.js` - JavaScript機能
- `manifest.json` - PWA設定
- `sw.js` - Service Worker
- `offline.html` - オフラインページ

#### 🔍 更新前チェックリスト
- [ ] HTML構文エラーがないか確認
- [ ] CSS構文エラーがないか確認  
- [ ] JavaScript構文エラーがないか確認
- [ ] Bot ID (6台分) が正しく設定されているか
- [ ] API エンドポイントが正しいか
- [ ] レスポンシブデザインが機能するか

## 🚀 Apacheサーバーへのデプロイ方法

### 方法1: 自動アップロードスクリプト使用 (推奨)

#### PowerShell版 (Windows)
```powershell
# ドライラン（実際のアップロードは行わない）
.\deploy.ps1 -DryRun

# 本番デプロイ
.\deploy.ps1 -ServerHost "your-server.com" -ServerUser "root"
```

#### Bash版 (Linux/macOS/WSL)
```bash
# スクリプトに実行権限付与
chmod +x upload.sh

# サーバー情報を編集
nano upload.sh
# SERVER_HOST="あなたのサーバーのIP またはドメイン"
# SERVER_USER="サーバーのユーザー名"
# SERVER_PATH="/srv/www/htdocs/aivis-chan-bot.com"

# アップロード実行
./upload.sh
```

### 方法2: 手動アップロード

#### SCP使用
```bash
# 個別ファイルアップロード
scp index.html root@your-server:/srv/www/htdocs/aivis-chan-bot.com/
scp css/main.css root@your-server:/srv/www/htdocs/aivis-chan-bot.com/css/
scp js/main.js root@your-server:/srv/www/htdocs/aivis-chan-bot.com/js/

# 一括アップロード
scp -r . root@your-server:/srv/www/htdocs/aivis-chan-bot.com/
```

#### rsync使用 (推奨)
```bash
# 差分のみアップロード（高速）
rsync -avz --delete --exclude='.git' --exclude='*.md' --exclude='*.ps1' --exclude='upload.sh' ./ root@your-server:/srv/www/htdocs/aivis-chan-bot.com/
```

### 方法3: FTPクライアント使用
- FileZilla, WinSCP, Cyberduck等を使用
- サーバー: あなたのサーバーIP
- ユーザー: root (またはWebサーバー用ユーザー)
- パス: `/srv/www/htdocs/aivis-chan-bot.com/`

## ⚙️ サーバー設定の確認

### Apache設定確認
```bash
# SSH接続してサーバーで実行
ssh root@your-server

# Apache設定テスト
apache2ctl configtest

# Apache再起動
systemctl reload apache2

# ログ確認
tail -f /var/log/apache2/error.log
tail -f /var/log/apache2/access.log
```

### ファイル権限設定
```bash
# サーバー上で実行
chown -R wwwrun:www /srv/www/htdocs/aivis-chan-bot.com/
chmod -R 644 /srv/www/htdocs/aivis-chan-bot.com/*
find /srv/www/htdocs/aivis-chan-bot.com/ -type d -exec chmod 755 {} \;
```

## 🔍 更新後の確認

### 1. Webサイト動作確認
- https://aivis-chan-bot.com にアクセス
- 6台のBotステータス表示確認
- Bot招待リンク動作確認
- レスポンシブデザイン確認
- PWA機能確認

### 2. API動作確認
```bash
# Bot API エンドポイント確認
curl -I https://status.aivis-chan-bot.com/api/bot1/status
curl -I https://status.aivis-chan-bot.com/api/bot2/status
# ... bot6まで確認
```

### 3. ブラウザ開発者ツールでエラー確認
- F12 → Console でJavaScriptエラー確認
- Network タブでAPIリクエスト確認
- Application タブでService Worker確認

## 🚨 トラブルシューティング

### よくある問題と解決方法

#### 1. ファイルが反映されない
```bash
# ブラウザキャッシュクリア: Ctrl + F5
# Service Worker更新確認
# Apache再起動
systemctl restart apache2
```

#### 2. 403 Forbidden エラー
```bash
# ファイル権限確認
ls -la /srv/www/htdocs/aivis-chan-bot.com/
# 権限修正
chmod 644 index.html
```

#### 3. Bot API接続エラー
- Bot IDが正しいか確認
- API エンドポイントURL確認
- CORS設定確認

#### 4. SSL証明書エラー
```bash
# Let's Encrypt証明書更新
certbot renew
systemctl reload apache2
```

## 📝 更新履歴の管理

### Git使用推奨
```bash
# 変更をコミット
git add .
git commit -m "Update: Bot status display improvements"
git push origin main

# タグ付け（バージョン管理）
git tag v2.0.0
git push origin v2.0.0
```

### デプロイログ確認
```bash
# デプロイ履歴確認
cat deploy.log
```

## 🔄 定期メンテナンス

### 週次作業
- [ ] Webサイト動作確認
- [ ] Bot API レスポンス確認
- [ ] サーバーログ確認

### 月次作業
- [ ] SSL証明書期限確認
- [ ] Apache設定見直し
- [ ] パフォーマンス最適化
- [ ] セキュリティアップデート

## 📞 緊急時連絡先
- サーバー管理者: [連絡先]
- 開発者: [連絡先]
- Bot運営チーム: [連絡先]
