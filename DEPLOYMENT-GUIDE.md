# 🚀 .envファイルのApacheサーバーへのアップロード手順

## ⚠️ セキュリティ重要事項

### 🔒 Botトークンの保護
- **絶対にGitにコミットしない**
- **公開リポジトリには絶対に含めない**
- **ファイル権限を適切に設定する**

## 📤 アップロード方法

### 1. **FTP/SFTP経由でのアップロード**

#### A. FileZilla使用
```bash
# FTPクライアント（FileZilla等）で接続
# サーバー: your-domain.com
# ユーザー名: your-username
# パスワード: your-password
# ポート: 21 (FTP) または 22 (SFTP)

# アップロード先: /var/www/html/api/ または /home/username/public_html/api/
```

#### B. WinSCP使用（Windows）
```
1. WinSCPを起動
2. サーバー情報を入力
3. .envファイルをドラッグ&ドロップ
4. API用ディレクトリにアップロード
```

#### C. コマンドライン（SCP）
```bash
# Windowsの場合（PowerShell）
scp .env username@your-server.com:/var/www/html/api/

# 秘密鍵使用の場合
scp -i your-key.pem .env username@your-server.com:/var/www/html/api/
```

### 2. **cPanel経由でのアップロード**

```bash
1. cPanelにログイン
2. 「ファイルマネージャー」を開く
3. public_html/api/ フォルダに移動
4. 「アップロード」ボタンをクリック
5. .envファイルを選択してアップロード
```

### 3. **SSH経由での直接作成**

```bash
# SSH接続
ssh username@your-server.com

# APIディレクトリに移動
cd /var/www/html/api/

# .envファイルを作成
nano .env

# 内容をコピー&ペースト後、Ctrl+X → Y → Enter で保存
```

## 🔧 Apacheサーバー設定

### .htaccessファイルの作成
```apache
# /var/www/html/api/.htaccess
# .envファイルへの直接アクセスを禁止
<Files ".env">
    Require all denied
</Files>

# セキュリティヘッダー
Header always set X-Content-Type-Options nosniff
Header always set X-Frame-Options DENY
Header always set X-XSS-Protection "1; mode=block"

# CORS設定（必要に応じて）
Header always set Access-Control-Allow-Origin "https://aivis-chan-bot.com"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
```

### ファイル権限の設定
```bash
# SSH接続後
chmod 600 .env          # 所有者のみ読み書き可能
chmod 644 .htaccess     # 一般的なhtaccessファイル権限
chown www-data:www-data .env  # Apacheユーザーに所有権設定（必要に応じて）
```

## 📁 推奨ディレクトリ構造

```
/var/www/html/
├── index.html          # ウェブサイトのフロントエンド
├── css/
├── js/
├── images/
└── api/                # APIサーバー用ディレクトリ
    ├── .env           # 環境変数（機密情報）
    ├── .htaccess      # セキュリティ設定
    ├── bot-stats-server.js
    ├── package.json
    └── node_modules/
```

## 🔄 本番環境用.envファイル設定

### 開発環境から本番環境への変更点
```env
# 本番環境用 .env ファイル

# Discord Bot トークン（実際の値）
BOT_TOKEN_1=実際のトークン1
BOT_TOKEN_2=実際のトークン2
# ... 他のトークン

# 本番環境設定
NODE_ENV=production
PORT=3001

# 本番ドメイン設定
CORS_ORIGIN=https://aivis-chan-bot.com
```

## 🚨 セキュリティチェックリスト

### ✅ アップロード前
- [ ] .gitignoreに.envが含まれている
- [ ] Gitリポジトリに.envをコミットしていない
- [ ] トークンが正しく設定されている

### ✅ アップロード後
- [ ] .envファイルの権限が600に設定されている
- [ ] .htaccessで.envへの直接アクセスが禁止されている
- [ ] HTTPSでのみアクセス可能になっている
- [ ] APIエンドポイントが正常に動作している

## 🧪 アップロード後のテスト

### 1. セキュリティテスト
```bash
# .envファイルに直接アクセスできないことを確認
curl https://your-domain.com/api/.env
# → 403 Forbidden または 404 Not Found が返ることを確認
```

### 2. API動作テスト
```bash
# ヘルスチェック
curl https://your-domain.com/api/health

# Bot統計取得
curl https://your-domain.com/api/bot-stats/1333819940645638154
```

### 3. CORS設定テスト
```javascript
// ブラウザのデベロッパーコンソールで
fetch('https://your-domain.com/api/health')
  .then(response => response.json())
  .then(data => console.log(data));
```

## 🔧 トラブルシューティング

### ファイルが見つからない場合
```bash
# ファイルの存在確認
ls -la /var/www/html/api/.env

# 権限確認
ls -l /var/www/html/api/.env
```

### Node.jsプロセス管理
```bash
# PM2使用（推奨）
npm install -g pm2
pm2 start bot-stats-server.js --name "aivis-api"
pm2 startup
pm2 save

# systemd使用
sudo systemctl enable aivis-api
sudo systemctl start aivis-api
```

## ⚡ 完了後の確認事項

1. ✅ ウェブサイトでリアルタイム統計が表示される
2. ✅ Bot統計が正確に更新される  
3. ✅ エラーログにトークン関連エラーがない
4. ✅ セキュリティスキャンで問題がない

## 💡 追加推奨事項

- **SSL証明書の設定** - HTTPSを必須にする
- **ファイアウォール設定** - 不要なポートを閉じる
- **定期バックアップ** - .envファイルを安全に保管
- **ログ監視** - 不正アクセスの検出
