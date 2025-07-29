# 🔒 root接続ブロック環境でのWinSCP使用方法

## ❌ 現在の状況

### root接続がブロックされている理由
```
セキュリティ設定:
✅ SSH設定でPermitRootLogin no
✅ サーバーのセキュリティポリシー
✅ 管理者による意図的な制限

これは正常なセキュリティ対策です
```

## ✅ 解決方法（優先順）

### 方法1: **一般ユーザーでWinSCP接続**

#### A. sudo権限ユーザーで接続
```
WinSCP接続設定:
転送プロトコル: SFTP
ホスト名: your-server.com
ポート: 22
ユーザー名: あなたの一般ユーザー名（sudoグループ所属）
パスワード: そのユーザーのパスワード

例:
ユーザー名: ubuntu, admin, username など
```

#### B. 接続後の権限昇格
```
1. WinSCPで一般ユーザーとして接続
2. ホームディレクトリ（/home/username/）に.envファイルアップロード
3. WinSCPターミナルでsudoコマンド使用:
   sudo mv /home/username/.env /var/www/html/api/
   sudo chmod 600 /var/www/html/api/.env
   sudo chown www-data:www-data /var/www/html/api/.env
```

### 方法2: **sudo設定の一時的な変更（上級者向け）**

#### A. SFTP Subsystemの設定
```
SSH接続でサーバーに入り、設定変更:
sudo visudo

以下の行を追加:
username ALL=(ALL) NOPASSWD: /usr/lib/openssh/sftp-server

これによりSFTPでsudo権限が使用可能
```

#### B. WinSCP SFTP設定
```
WinSCP → 高度な設定 → SFTP
SFTPサーバー: sudo /usr/lib/openssh/sftp-server

これで一般ユーザーでもroot権限でファイル操作可能
```

### 方法3: **書き込み可能ディレクトリの使用**

#### A. ユーザーディレクトリ経由
```
Step 1: ホームディレクトリにアップロード
WinSCP接続 → /home/username/ に .env をアップロード

Step 2: ターミナルで移動
ssh username@server
sudo cp /home/username/.env /var/www/html/api/
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env
rm /home/username/.env  # 一時ファイル削除
```

#### B. tmp ディレクトリ経由
```
Step 1: /tmp にアップロード
WinSCP → /tmp/ に .env をアップロード

Step 2: ターミナルで移動
sudo mv /tmp/.env /var/www/html/api/
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env
```

### 方法4: **WinSCPエディタで直接作成**

#### A. サーバー上で直接ファイル作成
```
1. WinSCP一般ユーザーで接続
2. /tmp/ ディレクトリに移動
3. 右クリック → 新規 → ファイル → .env
4. WinSCPエディタで内容入力:
```

```env
# Discord Bot Statistics Server Environment Variables
BOT_TOKEN_1=実際のトークン1
BOT_TOKEN_2=実際のトークン2
BOT_TOKEN_3=実際のトークン3
BOT_TOKEN_4=実際のトークン4
BOT_TOKEN_5=実際のトークン5
BOT_TOKEN_6=実際のトークン6

NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://aivis-chan-bot.com
```

#### B. ファイル移動
```
WinSCPターミナルで:
sudo mv /tmp/.env /var/www/html/api/
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env
```

## 🚀 推奨ワークフロー

### **Aivis-chan Bot .env アップロード完全手順**

#### Step 1: 一般ユーザーでWinSCP接続
```
プロトコル: SFTP
ユーザー名: sudo権限のある一般ユーザー
ディレクトリ: /home/username/ (ホームディレクトリ)
```

#### Step 2: ホームディレクトリに.envアップロード
```
方法:
• F5キー でアップロード
• 右クリック → アップロード
• エディタで新規作成
```

#### Step 3: WinSCPターミナルでsudo操作
```bash
# ターミナル起動 (Ctrl+T)
cd /home/username/

# .envファイルの存在確認
ls -la .env

# APIディレクトリに移動
sudo cp .env /var/www/html/api/

# 権限設定
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env

# 一時ファイル削除
rm .env

# 結果確認
sudo ls -la /var/www/html/api/.env
```

#### Step 4: .htaccess設定
```bash
# .htaccessファイル作成
sudo tee /var/www/html/api/.htaccess << 'EOF'
<Files ".env">
    Require all denied
</Files>

<FilesMatch "\.(env|log|key|pem)$">
    Require all denied
</FilesMatch>

Header always set Access-Control-Allow-Origin "https://aivis-chan-bot.com"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
EOF

# 権限設定
sudo chmod 644 /var/www/html/api/.htaccess
sudo chown www-data:www-data /var/www/html/api/.htaccess
```

#### Step 5: Node.js アプリケーション設定
```bash
# APIディレクトリに移動
cd /var/www/html/api/

# 依存関係インストール
npm install

# PM2でサービス起動
sudo npm install -g pm2
pm2 start bot-stats-server.js --name "aivis-api"
pm2 startup
pm2 save

# Apache再起動
sudo systemctl restart apache2
```

## 🛠️ トラブルシューティング

### sudo権限がない場合
```
エラー: "username is not in the sudoers file"

解決策:
1. サーバー管理者に連絡してsudo権限付与を依頼
2. または管理者に.envファイル配置を依頼
3. 別のsudo権限ユーザーアカウントを使用
```

### SFTPでsudo使用する場合
```
WinSCP高度な設定:
環境 → SFTP → SFTPサーバー:
sudo /usr/lib/openssh/sftp-server

注意: この設定はセキュリティリスクがあるため
使用後は元に戻すことを推奨
```

### ディレクトリ権限エラー
```
エラー: Permission denied

解決策:
1. 書き込み可能ディレクトリ使用:
   /tmp/, /home/username/, /var/tmp/
2. sudo権限で事前にディレクトリ作成:
   sudo mkdir -p /var/www/html/api
   sudo chmod 755 /var/www/html/api
```

## 🔍 セキュリティ確認

### アップロード後の必須チェック
```bash
# ファイル存在・権限確認
sudo ls -la /var/www/html/api/.env
# 出力例: -rw------- 1 www-data www-data 512 Jan 21 10:30 .env

# .envファイルへの直接アクセス禁止確認
curl https://your-domain.com/api/.env
# 期待結果: 403 Forbidden

# API動作確認
curl https://your-domain.com/api/health
# 期待結果: {"status":"healthy",...}

# Bot統計取得確認
curl https://your-domain.com/api/bot-stats/1333819940645638154
# 期待結果: {"success":true,"online":true,...}
```

## 💡 代替手段

### WinSCP以外の方法
```
1. SCP コマンド:
   scp .env username@server:/tmp/
   ssh username@server
   sudo mv /tmp/.env /var/www/html/api/

2. rsync:
   rsync -avz .env username@server:/tmp/
   ssh username@server
   sudo mv /tmp/.env /var/www/html/api/

3. FileZilla (SFTP):
   一般ユーザーで接続、同様の手順

4. cPanel/ファイルマネージャー:
   Webベースの管理画面経由
```

## 🎯 まとめ

**root接続ブロック環境での.envアップロード:**

1. ✅ **一般ユーザーで接続** - 最も安全
2. ✅ **ホームディレクトリ経由** - 確実な方法
3. ✅ **sudoコマンドで権限設定** - 適切なセキュリティ
4. ✅ **WinSCPターミナル活用** - 統合環境

**この方法なら、rootアクセスなしでも完全にデプロイ可能です！** 🚀

実際のサーバーの一般ユーザー名がわかれば、具体的な手順をお教えできます。
