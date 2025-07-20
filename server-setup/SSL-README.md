# SSL証明書設定ガイド

このディレクトリには、AivisChan Botステータスページ用のSSL証明書設定スクリプトが含まれています。

## ファイル構成

- `ssl-setup.sh` - 完全なSSL証明書取得・設定スクリプト
- `ssl-quick-setup.sh` - 簡易SSL証明書取得スクリプト
- `ssl-manager.sh` - SSL証明書管理・監視ツール

## 使用方法

### 1. 簡易セットアップ（推奨）

最も簡単な方法です：

```bash
# Linux サーバー（openSUSE Leap 15.6）で実行
cd /path/to/Aivis-chan-bot-web/server-setup
chmod +x ssl-quick-setup.sh
sudo ./ssl-quick-setup.sh
```

このスクリプトは以下を自動実行します：
- Certbotのインストール
- ファイアウォール設定
- Apache SSL設定
- 証明書取得
- 自動更新設定

### 2. 詳細セットアップ

より詳細な制御が必要な場合：

```bash
chmod +x ssl-setup.sh
sudo ./ssl-setup.sh alecjp02.asuscomm.com admin@alecjp02.asuscomm.com
```

### 3. 証明書管理

証明書の状態確認や管理：

```bash
chmod +x ssl-manager.sh

# インタラクティブモード
sudo ./ssl-manager.sh

# コマンドラインモード
sudo ./ssl-manager.sh health        # ヘルスチェック
sudo ./ssl-manager.sh details       # 証明書詳細
sudo ./ssl-manager.sh test          # 接続テスト
sudo ./ssl-manager.sh renew         # 証明書更新
```

## 事前準備

### 必要な要件

1. **ドメイン名の設定**
   - `alecjp02.asuscomm.com` がサーバーのIPアドレスに正しく解決される
   - DNSレコード（A レコード）が設定済み

2. **ネットワーク設定**
   - ポート80（HTTP）とポート443（HTTPS）が開放されている
   - ファイアウォール設定が適切

3. **Webサーバー**
   - Apache2が正常に動作している
   - サイトファイルが正しく配置されている

### ドメイン疎通確認

証明書取得前に、以下でドメインアクセスを確認：

```bash
# HTTPアクセステスト
curl -I http://alecjp02.asuscomm.com

# DNS解決確認
nslookup alecjp02.asuscomm.com
```

## SSL証明書取得プロセス

### Let's Encrypt について

- **無料のSSL証明書** - 90日間有効
- **自動更新対応** - Certbotで自動更新可能
- **信頼されたCA** - ブラウザで警告なし

### 証明書取得方法

1. **Webサーバー認証**（推奨）
   - Apacheプラグインを使用
   - 自動でVirtualHost設定

2. **スタンドアロン認証**
   - Webサーバーを一時停止
   - 手動でSSL設定が必要

3. **DNS認証**
   - DNSレコードによる認証
   - ワイルドカード証明書に対応

## 設定後の確認

### HTTPS アクセステスト

```bash
# SSL接続テスト
curl -I https://alecjp02.asuscomm.com

# 証明書詳細確認
openssl s_client -connect alecjp02.asuscomm.com:443 -servername alecjp02.asuscomm.com
```

### ブラウザアクセス

1. `https://alecjp02.asuscomm.com` にアクセス
2. 鍵マークが表示されることを確認
3. 証明書情報をチェック

## トラブルシューティング

### よくある問題

1. **ドメインが解決されない**
   ```bash
   # DNS確認
   dig alecjp02.asuscomm.com
   nslookup alecjp02.asuscomm.com
   ```

2. **ポート80/443がブロックされている**
   ```bash
   # ファイアウォール確認
   sudo firewall-cmd --list-all
   sudo netstat -tlnp | grep :80
   sudo netstat -tlnp | grep :443
   ```

3. **Apacheが起動しない**
   ```bash
   # Apache状態確認
   sudo systemctl status apache2
   sudo apache2ctl configtest
   ```

4. **証明書の期限切れ**
   ```bash
   # 手動更新
   sudo certbot renew --force-renewal
   sudo systemctl reload apache2
   ```

### エラーメッセージ対応

- `Address already in use` → ポート80/443を使用中のプロセスを確認
- `Failed authorization procedure` → DNS設定とドメイン疎通を確認  
- `Apache doesn't appear to be running` → Apache起動状態を確認

## セキュリティ強化

### 推奨設定

1. **強力なSSL設定**
   ```apache
   # /etc/apache2/sites-available/ssl.conf
   SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
   SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
   ```

2. **セキュリティヘッダー**
   ```apache
   Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
   Header always set X-Frame-Options DENY
   Header always set X-Content-Type-Options nosniff
   Header always set Referrer-Policy "strict-origin-when-cross-origin"
   ```

3. **HSTS preload登録**
   - [hstspreload.org](https://hstspreload.org/) でドメインを登録

## 自動更新設定

### Cron設定

証明書は90日間有効なので、定期的な更新が必要：

```bash
# 現在のcron確認
crontab -l

# 自動更新設定（毎日午前3時）
0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload apache2
```

### 更新テスト

```bash
# ドライラン（実際には更新しない）
sudo certbot renew --dry-run

# 強制更新
sudo certbot renew --force-renewal
```

## 証明書ファイル

### ファイル配置

```
/etc/letsencrypt/live/alecjp02.asuscomm.com/
├── cert.pem          # 証明書のみ
├── chain.pem         # 中間証明書
├── fullchain.pem     # 証明書 + 中間証明書
└── privkey.pem       # 秘密鍵
```

### Apache設定で使用

```apache
SSLCertificateFile /etc/letsencrypt/live/alecjp02.asuscomm.com/fullchain.pem
SSLCertificateKeyFile /etc/letsencrypt/live/alecjp02.asuscomm.com/privkey.pem
```

## 関連リンク

- [Let's Encrypt 公式サイト](https://letsencrypt.org/)
- [Certbot 公式ドキュメント](https://certbot.eff.org/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/)

## サポート

問題が発生した場合：

1. ログファイルを確認
   - `/var/log/letsencrypt/letsencrypt.log`
   - `/var/log/apache2/error.log`

2. 設定ファイルを確認
   - `/etc/apache2/sites-available/`
   - `/etc/letsencrypt/renewal/`

3. `ssl-manager.sh` でヘルスチェック実行
