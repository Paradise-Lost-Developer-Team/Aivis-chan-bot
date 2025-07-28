# Aivis-chan Bot ステータスページ セットアップガイド

## 🚀 クイックセットアップ（推奨）

### ステップ1: ファイル転送
```bash
# WindowsからopenSUSE Leapサーバーにファイルを転送
scp -r c:\Users\uketp\Aivis-chan-bot-web alec@mcserver:~/
```

### ステップ2: サーバーでセットアップ実行
```bash
# SSH接続
ssh alec@mcserver

# セットアップスクリプト実行
cd ~/Aivis-chan-bot-web/server-setup
chmod +x simple-install.sh
sudo ./simple-install.sh
```

## 📋 手動セットアップ

### 1. システム更新
```bash
sudo zypper refresh
sudo zypper update -y --auto-agree-with-licenses
```

### 2. Apache インストール
```bash
# Apache2のインストール
sudo zypper install -y --auto-agree-with-licenses apache2

# モジュール有効化
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod ssl

# サービス開始・有効化
sudo systemctl enable apache2
sudo systemctl start apache2
```

### 3. ファイアウォール設定
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 4. Webファイル配置
```bash
# HTMLファイルをコピー
sudo cp ~/Aivis-chan-bot-web/*.html /srv/www/htdocs/

# CSS、JS、画像をコピー
sudo cp -r ~/Aivis-chan-bot-web/css /srv/www/htdocs/
sudo cp -r ~/Aivis-chan-bot-web/js /srv/www/htdocs/
sudo cp -r ~/Aivis-chan-bot-web/images /srv/www/htdocs/

# 権限設定
sudo chown -R wwwrun:www /srv/www/htdocs/
sudo chmod -R 644 /srv/www/htdocs/*
sudo find /srv/www/htdocs/ -type d -exec chmod 755 {} \;
```

### 5. Apache仮想ホスト設定
```bash
# 設定ファイル作成
sudo tee /etc/apache2/vhosts.d/aivis-status.conf << 'EOF'
<VirtualHost *:80>
    DocumentRoot /srv/www/htdocs
    ServerName status.local
    
    <Directory /srv/www/htdocs>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    # CORSヘッダーの設定（APIアクセス用）
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type"
    
    ErrorLog /var/log/apache2/aivis-status_error.log
    CustomLog /var/log/apache2/aivis-status_access.log combined
</VirtualHost>
EOF

# Apache再起動
sudo systemctl restart apache2
```

## 🔍 動作確認

### 1. Apacheステータス確認
```bash
sudo systemctl status apache2
```

### 2. ポート確認
```bash
sudo netstat -tlnp | grep :80
```

### 3. Webアクセステスト
```bash
# ローカルアクセス
curl -I http://localhost/

# ファイル確認
curl http://localhost/index.html
```

## 🌐 アクセス情報

- **ローカル**: http://localhost/
- **ネットワーク**: http://[サーバーIP]/
- **ステータスページ**: http://[サーバーIP]/index.html

## 🔧 トラブルシューティング

### Apache起動エラー
```bash
# エラーログ確認
sudo tail -f /var/log/apache2/error_log

# 設定ファイル確認
sudo apache2ctl configtest
```

### ファイアウォール問題
```bash
# ファイアウォール状況確認
sudo firewall-cmd --list-all

# HTTP/HTTPSサービス確認
sudo firewall-cmd --list-services
```

### 権限問題
```bash
# Webファイル権限再設定
sudo chown -R wwwrun:www /srv/www/htdocs/
sudo chmod -R 644 /srv/www/htdocs/*
sudo find /srv/www/htdocs/ -type d -exec chmod 755 {} \;
```

## 📁 重要なパス

- **Webファイル**: `/srv/www/htdocs/`
- **Apache設定**: `/etc/apache2/`
- **仮想ホスト**: `/etc/apache2/vhosts.d/`
- **ログファイル**: `/var/log/apache2/`

## 🔄 SSL証明書設定（オプション）

Let's Encryptを使用してSSL証明書を設定する場合：

```bash
# Certbotインストール
sudo zypper install -y --auto-agree-with-licenses certbot python3-certbot-apache

# 証明書取得（ドメインを設定済みの場合）
sudo certbot --apache -d yourdomain.com
```
