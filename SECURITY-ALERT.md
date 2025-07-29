# 🚨 緊急: Botトークンセキュリティ対策

## ⚠️ CRITICAL SECURITY ALERT

現在の`.env`ファイルに**実際のDiscord Botトークン**が含まれています！

## 🔒 即座に実行すべき対策

### 1. **トークンの無効化と再生成**
```
1. Discord Developer Portal (https://discord.com/developers/applications) にアクセス
2. 各Botアプリケーションを開く
3. Bot → Token → "Regenerate" をクリック
4. 新しいトークンを安全にコピー
5. .envファイルを新しいトークンで更新
```

### 2. **Gitリポジトリからの削除**
```bash
# もしGitにコミットしてしまった場合
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all

# または git history全体を削除
git checkout --orphan newBranch
git add -A
git commit -m "Initial commit with secure tokens"
git branch -D main
git branch -m main
git push -f origin main
```

### 3. **GitHub Secrets設定（推奨）**
```
1. GitHubリポジトリ → Settings → Secrets and variables → Actions
2. New repository secret をクリック
3. 各トークンを以下の名前で保存:
   - BOT_TOKEN_1
   - BOT_TOKEN_2
   - BOT_TOKEN_3
   - BOT_TOKEN_4
   - BOT_TOKEN_5
   - BOT_TOKEN_6
```

## 🛡️ 安全なデプロイメント手順

### サーバー上での.env作成
```bash
# SSH接続
ssh username@your-server.com

# APIディレクトリに移動
cd /var/www/html/api/

# 安全に.envファイルを作成
nano .env

# 以下の内容を手動入力（新しいトークンを使用）
```

### 新しい.envテンプレート
```env
# Discord Bot Statistics Server Environment Variables
# 本番環境用 - 再生成されたトークンを使用

# Bot 1 (Main): 1333819940645638154
BOT_TOKEN_1=新しく再生成されたトークン1

# Bot 2: 1334732369831268352
BOT_TOKEN_2=新しく再生成されたトークン2

# Bot 3: 1334734681656262770
BOT_TOKEN_3=新しく再生成されたトークン3

# Bot 4: 1365633502988472352
BOT_TOKEN_4=新しく再生成されたトークン4

# Bot 5: 1365633586123771934
BOT_TOKEN_5=新しく再生成されたトークン5

# Bot 6: 1365633656173101086
BOT_TOKEN_6=新しく再生成されたトークン6

# Server Configuration
NODE_ENV=production
PORT=3001

# CORS Origins (本番環境用)
CORS_ORIGIN=https://aivis-chan-bot.com
```

## 🔧 Apache/サーバー設定

### 必須セキュリティ設定
```apache
# .htaccess ファイル
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
```

### ファイル権限
```bash
# 最小限の権限設定
chmod 600 .env                    # 所有者のみ読み書き
chmod 700 /var/www/html/api/      # ディレクトリアクセス制限
chown www-data:www-data .env      # Webサーバーユーザーに所有権
```

## 🚀 安全なアップロード方法

### 1. SCP使用（推奨）
```bash
# ローカルで新しい.envを作成後
scp -P 22 .env username@server:/var/www/html/api/
```

### 2. SSH直接編集（最も安全）
```bash
ssh username@server
cd /var/www/html/api/
nano .env
# 内容を手動で入力
```

### 3. 環境変数経由（上級者向け）
```bash
# サーバー側で環境変数を設定
export BOT_TOKEN_1="新しいトークン1"
export BOT_TOKEN_2="新しいトークン2"
# Node.jsアプリケーションが直接環境変数を読み取る
```

## ✅ 安全性確認チェックリスト

- [ ] 古いトークンを全て無効化
- [ ] 新しいトークンを再生成
- [ ] .envファイルをGitから完全削除
- [ ] サーバー上で権限を600に設定
- [ ] .htaccessで.envアクセスを禁止
- [ ] HTTPS化完了
- [ ] APIエンドポイントが正常動作
- [ ] Bot権限が正しく設定されている

## 🔍 侵害チェック

### Botトークンが漏洩した場合の確認事項
```bash
# Discord APIでBot情報確認
curl -H "Authorization: Bot YOUR_NEW_TOKEN" \
     https://discord.com/api/v10/users/@me

# サーバーログの確認
tail -f /var/log/apache2/access.log | grep -i ".env"
tail -f /var/log/apache2/error.log
```

## 💡 将来の予防策

1. **環境変数管理ツール使用**
   - dotenv-vault
   - AWS Parameter Store
   - HashiCorp Vault

2. **CI/CDパイプライン設定**
   - GitHub Actions with Secrets
   - 自動デプロイメント

3. **定期的なトークンローテーション**
   - 月1回のトークン更新
   - 監査ログの確認

## 🆘 緊急時の連絡先

トークンが侵害された可能性がある場合:
1. 即座に全Botトークンを無効化
2. Discord Developer Portalで新トークン生成
3. 全サーバー管理者に状況報告
4. セキュリティログの詳細確認
