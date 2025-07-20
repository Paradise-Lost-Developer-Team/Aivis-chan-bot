# openSUSE Leap サーバーセットアップ

このディレクトリには、openSUSE LeapサーバーでAivis-chan Botステータスページをホスティングするためのスクリプトと設定ファイルが含まれています。

## ファイル一覧

| ファイル名 | 説明 |
|-----------|------|
| `install.sh` | 自動インストールスクリプト |
| `deploy.sh` | デプロイスクリプト |
| `backup.sh` | バックアップスクリプト |
| `monitor.sh` | 監視スクリプト |
| `system-update.sh` | システム更新スクリプト（ライセンス自動同意対応） |
| `opensuse-setup.md` | 詳細セットアップガイド |
| `troubleshooting.md` | トラブルシューティングガイド |
| `zypper.conf.sample` | zypper設定ファイルサンプル |
| `aivis-status-backup.service` | systemdサービスファイル |
| `aivis-status-backup.timer` | systemdタイマーファイル |

## クイックスタート

### 1. 自動インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-repo/aivis-chan-bot-web.git
cd aivis-chan-bot-web/server-setup

# 実行権限を付与
chmod +x *.sh

# インストール実行（ドメイン名とメールアドレスを指定）
sudo DOMAIN_NAME=status.yourdomain.com ADMIN_EMAIL=admin@yourdomain.com ./install.sh
```

### 2. ファイルのデプロイ

```bash
# ステータスページファイルをサーバーにデプロイ
sudo /usr/local/bin/deploy-aivis-status.sh
```

### 3. 動作確認

```bash
# ブラウザでアクセス
# http://status.yourdomain.com
# https://status.yourdomain.com (SSL設定済みの場合)
```

## カスタマイズ

### 環境変数

インストール時に以下の環境変数を設定できます：

- `DOMAIN_NAME`: ドメイン名 (例: status.example.com)
- `ADMIN_EMAIL`: 管理者メールアドレス
- `WEBSERVER`: Webサーバー (apache または nginx)

### 例

```bash
# Nginxを使用してインストール
sudo WEBSERVER=nginx DOMAIN_NAME=status.example.com ./install.sh

# カスタム設定でインストール
sudo DOMAIN_NAME=bot-status.mysite.com ADMIN_EMAIL=me@mysite.com ./install.sh
```

## 管理コマンド

### デプロイ

```bash
# 新しいファイルをデプロイ
sudo /usr/local/bin/deploy-aivis-status.sh
```

### バックアップ

```bash
# 手動バックアップ実行
sudo /usr/local/bin/backup-aivis-status.sh

# バックアップ一覧表示
sudo /usr/local/bin/backup-aivis-status.sh --list

# バックアップから復元
sudo /usr/local/bin/backup-aivis-status.sh --restore /var/backups/aivis-status/files-20250121-120000.tar.gz
```

### 監視

```bash
# ヘルスチェック実行
sudo /usr/local/bin/monitor-aivis-status.sh check

# 連続監視開始
sudo /usr/local/bin/monitor-aivis-status.sh monitor

# ヘルスレポート生成
sudo /usr/local/bin/monitor-aivis-status.sh report
```

### システム更新

```bash
# 対話的にシステム更新
sudo /usr/local/bin/system-update.sh

# 自動的にシステム更新（ライセンス自動同意）
sudo /usr/local/bin/system-update.sh auto

# 手動でパッケージ更新（ライセンス自動同意）
sudo zypper update --auto-agree-with-licenses
```

### ログ確認

```bash
# Webサーバーログ
sudo tail -f /var/log/apache2/aivis-status-access.log
sudo tail -f /var/log/apache2/aivis-status-error.log

# 管理スクリプトログ
sudo tail -f /var/log/deploy-aivis-status.log
sudo tail -f /var/log/backup-aivis-status.log
sudo tail -f /var/log/monitor-aivis-status.log
```

## 自動化設定

### 定期バックアップ

systemdタイマーが自動的に設定され、毎日バックアップが実行されます：

```bash
# タイマー状況確認
sudo systemctl status aivis-status-backup.timer

# 手動でサービス実行
sudo systemctl start aivis-status-backup.service
```

### SSL証明書の自動更新

Let's Encryptの証明書は自動的に更新されます：

```bash
# 証明書状況確認
sudo certbot certificates

# 手動更新テスト
sudo certbot renew --dry-run
```

## トラブルシューティング

### ライセンス同意エラー

```bash
# エラー: ライセンス (使用許諾) 契約条項に同意しますか？
# 解決: 自動同意オプションを使用
sudo zypper update --auto-agree-with-licenses

# または一括設定
echo "autoAgreeWithLicenses = yes" | sudo tee -a /etc/zypp/zypp.conf
```

### よくある問題

1. **403 Forbidden エラー**
   ```bash
   sudo chmod -R 755 /var/www/html/aivis-status
   sudo chown -R wwwrun:www /var/www/html/aivis-status
   ```

2. **SSL証明書エラー**
   ```bash
   sudo certbot certificates
   sudo certbot renew --force-renewal -d status.yourdomain.com
   ```

3. **Webサーバーが起動しない**
   ```bash
   # Apache
   sudo apache2ctl configtest
   sudo systemctl status apache2
   
   # Nginx
   sudo nginx -t
   sudo systemctl status nginx
   ```

### ログの確認

```bash
# システムログ
sudo journalctl -u apache2 -f
sudo journalctl -u nginx -f

# Webサーバーエラーログ
sudo tail -f /var/log/apache2/error.log
sudo tail -f /var/log/nginx/error.log
```

## セキュリティ

### ファイアウォール設定

```bash
# 現在の設定確認
sudo firewall-cmd --list-all

# ポート開放状況確認
sudo ss -tulpn | grep :80
sudo ss -tulpn | grep :443
```

### fail2ban設定

```bash
# 状況確認
sudo fail2ban-client status
sudo fail2ban-client status apache-auth

# ログ確認
sudo tail -f /var/log/fail2ban.log
```

## パフォーマンス最適化

### Apache最適化

```bash
# worker.confの調整（必要に応じて）
sudo nano /etc/apache2/server-tuning.conf
```

### ログローテーション

ログローテーションは自動的に設定されますが、設定を確認する場合：

```bash
sudo nano /etc/logrotate.d/aivis-status
sudo logrotate -d /etc/logrotate.d/aivis-status  # テスト実行
```

## 参考資料

- [openSUSE Leap Documentation](https://doc.opensuse.org/)
- [Apache HTTP Server Documentation](https://httpd.apache.org/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

## サポート

問題が発生した場合は、以下を確認してください：

1. `opensuse-setup.md` の詳細ガイド
2. ログファイルの内容
3. システムサービスの状況

それでも解決しない場合は、以下の情報と共にお問い合わせください：

- openSUSE Leapのバージョン
- エラーメッセージ
- 関連するログファイルの内容
