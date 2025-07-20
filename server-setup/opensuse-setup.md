# openSUSE Leap サーバー設定ガイド

## 前提条件
- openSUSE Leap 15.4+ が動作していること
- sudoまたはroot権限があること
- インターネット接続があること

## 1. パッケージのインストール

### Apache + PHP を使用する場合
```bash
sudo zypper refresh
sudo zypper install apache2 apache2-mod_php8 php8 php8-json
sudo systemctl enable apache2
sudo systemctl start apache2
```

### Nginx を使用する場合  
```bash
sudo zypper refresh
sudo zypper install nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 共通パッケージ
```bash
# SSL証明書用
sudo zypper install certbot python3-certbot-apache

# Git（ファイル更新用）
sudo zypper install git

# ファイアウォール設定
sudo systemctl enable firewalld
sudo systemctl start firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 2. Apache設定（推奨）

### バーチャルホスト設定
```bash
sudo cp /etc/apache2/vhosts.d/vhost.template /etc/apache2/vhosts.d/aivis-status.conf
sudo nano /etc/apache2/vhosts.d/aivis-status.conf
```

設定内容：
```apache
<VirtualHost *:80>
    ServerName status.yourdomain.com
    DocumentRoot /var/www/html/aivis-status
    
    <Directory /var/www/html/aivis-status>
        AllowOverride All
        Require all granted
        
        # CORS設定
        Header always set Access-Control-Allow-Origin "*"
        Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Directory>
    
    # ログ設定
    ErrorLog /var/log/apache2/aivis-status-error.log
    CustomLog /var/log/apache2/aivis-status-access.log combined
    
    # セキュリティヘッダー
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>

<VirtualHost *:443>
    ServerName status.yourdomain.com
    DocumentRoot /var/www/html/aivis-status
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/status.yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/status.yourdomain.com/privkey.pem
    
    <Directory /var/www/html/aivis-status>
        AllowOverride All
        Require all granted
        
        # CORS設定
        Header always set Access-Control-Allow-Origin "*"
        Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Directory>
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>
```

### Apacheモジュールの有効化
```bash
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod ssl
sudo systemctl restart apache2
```

## 3. Nginx設定（代替案）

```bash
sudo nano /etc/nginx/sites-available/aivis-status
```

設定内容：
```nginx
server {
    listen 80;
    server_name status.yourdomain.com;
    root /var/www/html/aivis-status;
    index index.html;
    
    # CORS設定
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    
    # セキュリティヘッダー
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API プロキシ設定（必要に応じて）
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 443 ssl;
    server_name status.yourdomain.com;
    root /var/www/html/aivis-status;
    index index.html;
    
    ssl_certificate /etc/letsencrypt/live/status.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/status.yourdomain.com/privkey.pem;
    
    # SSL設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # セキュリティヘッダー
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 4. SSL証明書の取得

```bash
# Let's Encrypt証明書の取得
sudo certbot --apache -d status.yourdomain.com

# または手動設定
sudo certbot certonly --webroot -w /var/www/html/aivis-status -d status.yourdomain.com
```

## 5. ファイルのデプロイ

### 手動デプロイ
```bash
sudo mkdir -p /var/www/html/aivis-status
sudo chown -R wwwrun:www /var/www/html/aivis-status
sudo chmod -R 755 /var/www/html/aivis-status

# ファイルをコピー
sudo cp -r /path/to/your/files/* /var/www/html/aivis-status/
```

### 自動デプロイスクリプト作成
```bash
sudo nano /usr/local/bin/deploy-aivis-status.sh
```

## 6. 監視とメンテナンス

### systemd サービス監視
```bash
sudo systemctl status apache2
sudo systemctl status nginx
```

### ログ監視
```bash
sudo tail -f /var/log/apache2/aivis-status-access.log
sudo tail -f /var/log/apache2/aivis-status-error.log
```

### 自動バックアップ
```bash
# crontabに追加
sudo crontab -e

# 毎日午前2時にバックアップ
0 2 * * * /usr/local/bin/backup-aivis-status.sh
```

## 7. セキュリティ設定

### ファイアウォール詳細設定
```bash
# 特定のIPからのアクセス制限（必要に応じて）
sudo firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='192.168.1.0/24' service name='http' accept"
sudo firewall-cmd --reload
```

### fail2ban設定
```bash
sudo zypper install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## トラブルシューティング

### よくある問題
1. **403 Forbidden エラー**
   - ファイルの権限を確認: `sudo chmod -R 755 /var/www/html/aivis-status`
   - SELinuxの確認: `sudo setsebool -P httpd_can_network_connect 1`

2. **SSL証明書エラー**
   - 証明書の期限確認: `sudo certbot certificates`
   - 自動更新設定: `sudo crontab -e` に `0 12 * * * /usr/bin/certbot renew --quiet` を追加

3. **パフォーマンス問題**
   - Apache設定の最適化
   - ログローテーション設定

## 次のステップ
- CDN設定（Cloudflare等）
- 監視システム導入（Nagios、Zabbix等）
- 自動デプロイパイプライン構築
