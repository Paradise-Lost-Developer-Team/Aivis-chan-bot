# 📤 .envファイル - Apacheサーバーアップロード実践ガイド

## ✅ 現在のセキュリティ状況
- ✅ `.env`ファイルはGitにコミットされていません
- ✅ セキュリティリスクは低い状態
- ✅ 実際のBotトークンが設定済み

## 🚀 Apacheサーバーへのアップロード手順

### 方法1: SSH/SCP経由（推奨）

#### A. SCP使用
```bash
# PowerShellで実行
scp .env username@your-server.com:/var/www/html/api/

# カスタムSSHポート使用の場合
scp -P 2222 .env username@your-server.com:/var/www/html/api/

# 秘密鍵使用の場合
scp -i "C:\path\to\your-key.pem" .env username@your-server.com:/var/www/html/api/
```

#### B. SSH直接編集
```bash
# SSH接続
ssh username@your-server.com

# APIディレクトリに移動
cd /var/www/html/api/

# .envファイルを作成・編集
nano .env

# ローカルの.envファイル内容をコピー&ペースト
# Ctrl+X → Y → Enter で保存
```

### 方法2: Webベースファイルマネージャー

#### A. cPanel使用
```
1. cPanelにログイン
2. 「ファイルマネージャー」をクリック
3. public_html → api フォルダに移動
4. 「アップロード」ボタンをクリック
5. .envファイルを選択してアップロード
```

#### B. DirectAdmin使用
```
1. DirectAdminパネルにログイン
2. 「ファイルマネージャー」を選択
3. domains → your-domain.com → public_html → api に移動
4. 「アップロード」で.envファイルを選択
```

### 方法3: FTP/SFTP経由

#### A. FileZilla使用
```
1. FileZillaを起動
2. サーバー設定:
   - ホスト: your-server.com
   - ユーザー名: your-username
   - パスワード: your-password
   - ポート: 21 (FTP) または 22 (SFTP)
3. 接続後、/var/www/html/api/ フォルダに移動
4. .envファイルをドラッグ&ドロップ
```

#### B. WinSCP使用（Windows）
```
1. WinSCPを起動
2. 新しいセッションを作成
3. 転送プロトコル: SFTP
4. ホスト名、ユーザー名、パスワードを入力
5. ログイン後、リモートディレクトリに.envファイルをアップロード
```

## 🔧 アップロード後の必須設定

### 1. ファイル権限の設定
```bash
# SSH接続後
cd /var/www/html/api/
chmod 600 .env                      # 所有者のみ読み書き可能
chown www-data:www-data .env        # Webサーバーユーザーに所有権設定
```

### 2. .htaccessファイルの作成
```bash
# SSH接続後
cd /var/www/html/api/
nano .htaccess

# 以下の内容を追加:
```

```apache
# .envファイルへの直接アクセスを禁止
<Files ".env">
    Require all denied
</Files>

# その他の機密ファイルも保護
<FilesMatch "\.(env|log|key|pem)$">
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
```

### 3. Node.jsアプリケーションの起動

#### A. PM2使用（推奨）
```bash
# PM2インストール
npm install -g pm2

# アプリケーション起動
pm2 start bot-stats-server.js --name "aivis-api"

# 自動起動設定
pm2 startup
pm2 save
```

#### B. systemd使用
```bash
# サービスファイル作成
sudo nano /etc/systemd/system/aivis-api.service

# 以下の内容を追加:
[Unit]
Description=Aivis Bot Stats API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/html/api
ExecStart=/usr/bin/node bot-stats-server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target

# サービス有効化・起動
sudo systemctl enable aivis-api
sudo systemctl start aivis-api
```

## ✅ 動作確認

### 1. セキュリティ確認
```bash
# .envファイルに直接アクセスできないことを確認
curl https://your-domain.com/api/.env
# → 403 Forbidden が返ることを確認
```

### 2. API動作確認
```bash
# ヘルスチェック
curl https://your-domain.com/api/health

# Bot統計取得
curl https://your-domain.com/api/bot-stats/1333819940645638154

# 全Bot統計取得
curl https://your-domain.com/api/bot-stats
```

### 3. ウェブサイト表示確認
```
1. https://your-domain.com にアクセス
2. メインページの統計情報が正しく表示されることを確認
3. ブラウザのデベロッパーツールでエラーがないことを確認
```

## 🔍 トラブルシューティング

### API エラーが発生する場合
```bash
# ログ確認
tail -f /var/log/apache2/error.log
pm2 logs aivis-api

# ファイル権限確認
ls -la /var/www/html/api/.env

# プロセス確認
pm2 status
# または
sudo systemctl status aivis-api
```

### CORS エラーが発生する場合
```apache
# .htaccessのCORS設定を確認・修正
Header always set Access-Control-Allow-Origin "*"
# または特定ドメインのみ
Header always set Access-Control-Allow-Origin "https://aivis-chan-bot.com"
```

## 📋 完了チェックリスト

- [ ] .envファイルをサーバーにアップロード完了
- [ ] ファイル権限を600に設定
- [ ] .htaccessで.envアクセスを禁止
- [ ] Node.jsアプリケーションが正常起動
- [ ] API エンドポイントが正常動作
- [ ] ウェブサイトで統計情報が表示される
- [ ] セキュリティ設定が適用されている

## 🎯 本番環境での推奨事項

1. **HTTPS化必須** - SSL証明書の設定
2. **ファイアウォール設定** - 不要なポート閉鎖
3. **定期バックアップ** - .envファイルの安全な保管
4. **監視設定** - API稼働状況の監視
5. **ログ監視** - 不正アクセスの検出

これで`.env`ファイルを安全にApacheサーバーにアップロードできます！🚀
