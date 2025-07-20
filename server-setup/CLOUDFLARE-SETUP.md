# Cloudflare + openSUSE Leap セットアップガイド

`aivis-chan-bot.com` ドメインをCloudflareで管理し、openSUSE Leapサーバーでホストするための完全ガイドです。

## 🌐 概要

- **メインドメイン**: `aivis-chan-bot.com`
- **ステータスページ**: `status.aivis-chan-bot.com`
- **サーバー**: openSUSE Leap 15.6 + Apache2
- **SSL証明書**: Let's Encrypt（ワイルドカード証明書）
- **CDN**: Cloudflare

## 📋 事前準備

### 1. Cloudflareでドメイン追加

1. [Cloudflareダッシュボード](https://dash.cloudflare.com)にログイン
2. **「Add site」**をクリック
3. `aivis-chan-bot.com` を入力
4. プランを選択（Freeプランでも十分）
5. DNS設定を確認

### 2. DNS設定

Cloudflareで以下のDNSレコードを設定：

| タイプ | 名前 | 内容 | プロキシ状態 |
|--------|------|------|-------------|
| A | @ | サーバーのIPアドレス | 🔴 DNS only |
| A | www | サーバーのIPアドレス | 🔴 DNS only |
| A | status | サーバーのIPアドレス | 🔴 DNS only |

⚠️ **重要**: 初期設定時は**必ずプロキシを無効**（🔴 DNS only）にしてください

### 3. Cloudflare API Token取得

1. Cloudflareダッシュボード → **My Profile** → **API Tokens**
2. **「Create Token」** → **「Custom token」**
3. 以下のように設定：

```
Token name: aivis-chan-bot-ssl
Permissions:
  - Zone : Zone : Read
  - Zone : DNS : Edit
Zone Resources:
  - Include : Specific zone : aivis-chan-bot.com
```

4. **「Continue to summary」** → **「Create Token」**
5. トークンをコピー（一度しか表示されません）

## 🚀 サーバーセットアップ

### 1. ファイルアップロード

WindowsからLinuxサーバーにファイルをアップロード：

```bash
# SCP経由でファイル転送（完全版サイト）
scp -r c:\Users\uketp\Aivis-chan-bot-web\server-setup user@your-server-ip:/home/user/
scp -r c:\Users\uketp\Aivis-chan-bot-web\*.html c:\Users\uketp\Aivis-chan-bot-web\css c:\Users\uketp\Aivis-chan-bot-web\js c:\Users\uketp\Aivis-chan-bot-web\images c:\Users\uketp\Aivis-chan-bot-web\manifest.json c:\Users\uketp\Aivis-chan-bot-web\sw.js c:\Users\uketp\Aivis-chan-bot-web\offline.html user@your-server-ip:/home/user/Aivis-chan-bot-web/

# または全体をアップロード
scp -r c:\Users\uketp\Aivis-chan-bot-web user@your-server-ip:/home/user/
```

### 2. セットアップスクリプト実行

サーバーにSSH接続して実行：

```bash
ssh user@your-server-ip
cd ~/Aivis-chan-bot-web/server-setup
chmod +x cloudflare-setup.sh
sudo ./cloudflare-setup.sh
```

スクリプトの実行中に以下が求められます：

1. **事前確認**: Cloudflareの設定が完了していることを確認
2. **API Token**: 取得したCloudflare API Tokenを入力

### 3. 自動実行される処理

- Certbot + Cloudflare DNSプラグインのインストール
- Apache VirtualHost設定
- ワイルドカード SSL証明書取得
- HTTPS設定
- セキュリティヘッダー設定
- 自動更新設定

## 🔧 手動設定（必要に応じて）

### Apache設定カスタマイズ

```bash
# 設定ファイル編集
sudo nano /etc/apache2/sites-available/aivis-chan-bot.com-ssl.conf
sudo nano /etc/apache2/sites-available/status.aivis-chan-bot.com-ssl.conf

# 設定反映
sudo systemctl reload apache2
```

### ファイアウォール確認

```bash
# firewalld の場合
sudo firewall-cmd --list-all

# ufw の場合
sudo ufw status

# iptables の場合
sudo iptables -L -n
```

## 🛡️ Cloudflare設定（SSL証明書取得後）

### 1. SSL/TLS設定

1. Cloudflareダッシュボード → **SSL/TLS**
2. **Overview** → **「Full (strict)」** に設定

### 2. プロキシ有効化

DNS設定で各レコードのプロキシを有効化：

| タイプ | 名前 | プロキシ状態 |
|--------|------|-------------|
| A | @ | 🟠 Proxied |
| A | www | 🟠 Proxied |
| A | status | 🟠 Proxied |

### 3. セキュリティ設定

**Security** → **Settings**:
- **Security Level**: Medium
- **Challenge Passage**: 30 minutes
- **Browser Integrity Check**: On

### 4. 速度設定

**Speed** → **Optimization**:
- **Auto Minify**: HTML, CSS, JS を有効
- **Brotli**: On
- **Early Hints**: On

### 5. Page Rules（オプション）

**Rules** → **Page Rules**:

```
aivis-chan-bot.com/*
  - Always Use HTTPS: On
  - Automatic HTTPS Rewrites: On
  - Browser Cache TTL: 4 hours
```

## 📊 ステータスページ設定

### JavaScriptファイル更新

新しいドメインに対応するため、設定を更新：

```javascript
// js/status.js の更新
const baseUrl = 'https://status.aivis-chan-bot.com';
const ttsApiUrl = 'https://alecjp02.asuscomm.com:10101'; // または適切なエンドポイント
```

### CORS設定確認

Apache設定でCORSヘッダーが正しく設定されていることを確認：

```apache
Header set Access-Control-Allow-Origin "*"
Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header set Access-Control-Allow-Headers "Content-Type, Authorization"
```

## 🔍 動作確認

### 1. DNS伝播確認

```bash
# DNS解決確認
nslookup aivis-chan-bot.com
nslookup status.aivis-chan-bot.com

# 複数のDNSサーバーから確認
dig @8.8.8.8 aivis-chan-bot.com
dig @1.1.1.1 status.aivis-chan-bot.com
```

### 2. SSL証明書確認

```bash
# 証明書詳細表示
echo | openssl s_client -connect aivis-chan-bot.com:443 -servername aivis-chan-bot.com 2>/dev/null | openssl x509 -noout -text

# 有効期限確認
echo | openssl s_client -connect aivis-chan-bot.com:443 -servername aivis-chan-bot.com 2>/dev/null | openssl x509 -noout -dates
```

### 3. Webサイトアクセス

- **メインサイト**: https://aivis-chan-bot.com
- **WWWサブドメイン**: https://www.aivis-chan-bot.com
- **ステータスページ**: https://status.aivis-chan-bot.com

### 4. セキュリティテスト

- [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/analyze.html?d=aivis-chan-bot.com)
- [Security Headers](https://securityheaders.com/?q=aivis-chan-bot.com)

## 🔄 SSL証明書管理

### 証明書状態確認

```bash
# Let's Encrypt証明書一覧
sudo certbot certificates

# 有効期限確認
sudo ssl-manager.sh details aivis-chan-bot.com
```

### 手動更新

```bash
# 証明書更新（テスト）
sudo certbot renew --dry-run

# 強制更新
sudo certbot renew --force-renewal --cert-name aivis-chan-bot.com
sudo systemctl reload apache2
```

### 自動更新確認

```bash
# cron設定確認
crontab -l

# 自動更新テスト
sudo /usr/bin/certbot renew --quiet && sudo systemctl reload apache2
```

## 🎯 追加の最適化

### 1. Cloudflare Analytics

**Analytics** → **Web Analytics** でトラフィック分析を有効化

### 2. Cloudflare Workers（オプション）

高度なリクエスト処理やAPI プロキシ機能

### 3. 監視設定

```bash
# ログ監視
sudo tail -f /var/log/apache2/aivis-chan-bot.com-ssl-access.log
sudo tail -f /var/log/apache2/status.aivis-chan-bot.com-ssl-error.log
```

### 4. バックアップ設定

```bash
# Apache設定バックアップ
sudo tar -czf apache-config-backup.tar.gz /etc/apache2/sites-available/

# Let's Encrypt設定バックアップ
sudo tar -czf letsencrypt-backup.tar.gz /etc/letsencrypt/
```

## 🆘 トラブルシューティング

### よくある問題

1. **DNS伝播の遅延**
   - 最大48時間かかる場合がある
   - `dig` コマンドで確認

2. **SSL証明書エラー**
   ```bash
   # Cloudflare認証情報確認
   sudo cat /etc/letsencrypt/cloudflare.ini
   
   # API Token権限確認
   curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
        -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Apache起動失敗**
   ```bash
   # 設定テスト
   sudo apache2ctl configtest
   
   # ポート使用状況
   sudo netstat -tlnp | grep :443
   ```

4. **Cloudflareプロキシエラー**
   - DNS設定でプロキシを一時的に無効化
   - オリジンサーバーの直接確認

### ログ確認

```bash
# Apache エラーログ
sudo tail -f /var/log/apache2/error.log

# Let's Encrypt ログ
sudo tail -f /var/log/letsencrypt/letsencrypt.log

# システムログ
sudo journalctl -f -u apache2
```

## 📞 サポートリソース

- [Cloudflare ドキュメント](https://developers.cloudflare.com/)
- [Let's Encrypt ドキュメント](https://letsencrypt.org/docs/)
- [Apache HTTP Server ドキュメント](https://httpd.apache.org/docs/)
- [openSUSE Leap ドキュメント](https://doc.opensuse.org/)

---

## 📝 次のステップ

1. ✅ Cloudflareセットアップ完了
2. ✅ SSL証明書取得
3. ✅ Webサイトデプロイ
4. 🔄 ステータスページ機能テスト
5. 🔄 監視・アラート設定
6. 🔄 パフォーマンス最適化
