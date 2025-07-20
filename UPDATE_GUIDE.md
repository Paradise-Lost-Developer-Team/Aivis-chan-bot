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

### ⚠️ 重要: SSH Root無効化環境での対応

現在のサーバー環境では SSH root アクセスが禁止されているため、`alec` ユーザーでの接続が必要です。

### 方法1: パスワード認証版アップロード (現在推奨)

#### Windows PowerShell版
```powershell
# パスワード認証でアップロード（最も確実）
.\password-upload.ps1

# または SSH鍵認証版（現在問題あり）
.\simple-upload.ps1
```

#### Linux/WSL/Git Bash版
```bash
# upload.sh は現在権限問題で使用不可
# 代わりに手動アップロードを使用
```

### 方法2: 手動アップロード (確実な方法)

#### 個別ファイルアップロード
```bash
# HTMLファイル
scp index.html offline.html alec@alecjp02.asuscomm.com:/srv/www/htdocs/

# PWAファイル
scp manifest.json sw.js alec@alecjp02.asuscomm.com:/srv/www/htdocs/

# CSS/JSファイル
scp css/main.css alec@alecjp02.asuscomm.com:/srv/www/htdocs/css/
scp js/main.js alec@alecjp02.asuscomm.com:/srv/www/htdocs/js/

# 画像ファイル
scp -r images/* alec@alecjp02.asuscomm.com:/srv/www/htdocs/images/
```

### 方法3: Git ベースデプロイ (推奨改善案)

サーバー側でGitリポジトリをクローンして更新する方法：

```bash
# 初回のみ: サーバー側でリポジトリクローン
ssh alec@alecjp02.asuscomm.com
cd /srv/www/htdocs/
sudo git clone https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot.git aivis-chan-bot.com
sudo chown -R wwwrun:www aivis-chan-bot.com/

# 更新時: ローカルでプッシュ後、サーバーでプル
git push origin web
ssh alec@alecjp02.asuscomm.com "cd /srv/www/htdocs/aivis-chan-bot.com && sudo git pull origin web"
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

### 現在のサーバー環境
- サーバー: alecjp02.asuscomm.com  
- ユーザー: alec (SSH root無効化のため)
- パス: /srv/www/htdocs/ (直下)
- 権限: wwwrun:www (Apache用)

### Apache設定確認
```bash
# alecユーザーでSSH接続
ssh alec@alecjp02.asuscomm.com

# Apache設定テスト (sudo必要)
sudo apache2ctl configtest

# Apache再起動 (sudo必要)
sudo systemctl reload apache2

# ログ確認
sudo tail -f /var/log/apache2/error.log
sudo tail -f /var/log/apache2/access.log
```

### ファイル権限設定
```bash
# サーバー上で実行 (sudo必要)
sudo chown -R wwwrun:www /srv/www/htdocs/aivis-chan-bot.com/
sudo chmod -R 644 /srv/www/htdocs/aivis-chan-bot.com/*
sudo find /srv/www/htdocs/aivis-chan-bot.com/ -type d -exec chmod 755 {} \;
```

### 権限問題の解決 (システム管理者に依頼)
```bash
# alecユーザーをwwwグループに追加
sudo usermod -aG www alec

# グループ権限でファイル作成可能にする
sudo chmod g+s /srv/www/htdocs/aivis-chan-bot.com/
sudo chmod -R 775 /srv/www/htdocs/aivis-chan-bot.com/
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

#### 1. SSH権限エラー (Permission denied)
```bash
# 問題: alecユーザーでディレクトリ作成権限がない
# 解決策1: 既存ディレクトリに直接ファイルアップロード
scp index.html alec@alecjp02.asuscomm.com:/srv/www/htdocs/aivis-chan-bot.com/

# 解決策2: sudo権限でディレクトリ作成後、権限変更
ssh alec@alecjp02.asuscomm.com "sudo chown -R wwwrun:www /srv/www/htdocs/aivis-chan-bot.com/"
```

#### 2. ファイルが反映されない
```bash
# ブラウザキャッシュクリア: Ctrl + F5
# Service Worker更新確認
# Apache再起動 (sudo必要)
ssh alec@alecjp02.asuscomm.com "sudo systemctl restart apache2"
```

#### 3. 403 Forbidden エラー
```bash
# ファイル権限確認
ssh alec@alecjp02.asuscomm.com "ls -la /srv/www/htdocs/aivis-chan-bot.com/"
# 権限修正 (sudo必要)
ssh alec@alecjp02.asuscomm.com "sudo chmod 644 /srv/www/htdocs/aivis-chan-bot.com/index.html"
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
