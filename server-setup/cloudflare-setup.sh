#!/bin/bash

# Cloudflare + openSUSE Leap SSL設定スクリプト
# aivis-chan-bot.com ドメイン用

set -e

# 色付きメッセージ用の関数
print_message() {
    echo -e "\033[1;32m[INFO]\033[0m $1"
}

print_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

print_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

print_success() {
    echo -e "\033[1;42m[SUCCESS]\033[0m $1"
}

# 設定変数
DOMAIN="aivis-chan-bot.com"
EMAIL="admin@aivis-chan-bot.com"
SUBDOMAIN="status" # status.aivis-chan-bot.com で設定

# rootユーザーチェック
if [ "$EUID" -ne 0 ]; then
    print_error "このスクリプトはroot権限で実行してください"
    echo "使用方法: sudo $0"
    exit 1
fi

print_message "🌐 Cloudflare + openSUSE Leap SSL設定開始"
print_message "ドメイン: $DOMAIN"
print_message "サブドメイン: $SUBDOMAIN.$DOMAIN"

# 事前確認
echo "設定前の確認事項:"
echo "1. Cloudflareでドメインが追加済みか？"
echo "2. DNSレコードでサーバーIPが設定済みか？"
echo "3. Cloudflareプロキシ（オレンジ雲）は無効になっているか？"
echo
read -p "すべて確認済みですか？ (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Cloudflareの設定を先に完了してください"
    exit 0
fi

# 必要なパッケージのインストール
print_message "📦 必要なパッケージをインストール中..."
zypper refresh >/dev/null 2>&1
zypper install -y certbot python3-certbot-apache python3-certbot-dns-cloudflare >/dev/null 2>&1

# Cloudflare API設定
setup_cloudflare_credentials() {
    print_message "🔑 Cloudflare API認証情報を設定します"
    
    echo "Cloudflare API Token（推奨）またはGlobal API Keyが必要です"
    echo "API Tokenの取得方法:"
    echo "1. Cloudflareダッシュボード → My Profile → API Tokens"
    echo "2. 'Create Token' → 'Custom token'"
    echo "3. Permissions: Zone:Zone:Read, Zone:DNS:Edit"
    echo "4. Zone Resources: Include - Specific zone - aivis-chan-bot.com"
    echo
    
    read -p "API Token/Global API Keyを入力してください: " -s CLOUDFLARE_TOKEN
    echo
    
    if [ -z "$CLOUDFLARE_TOKEN" ]; then
        print_error "API Token/Keyが入力されていません"
        exit 1
    fi
    
    # Cloudflare認証情報ファイル作成
    mkdir -p /etc/letsencrypt
    cat > /etc/letsencrypt/cloudflare.ini << EOF
# Cloudflare API Token (推奨)
dns_cloudflare_api_token = $CLOUDFLARE_TOKEN

# または Global API Key を使用する場合:
# dns_cloudflare_email = your-email@example.com
# dns_cloudflare_api_key = your-global-api-key
EOF
    
    chmod 600 /etc/letsencrypt/cloudflare.ini
    print_success "Cloudflare認証情報を設定しました"
}

# Apache VirtualHost設定
setup_apache_virtualhost() {
    print_message "🌐 Apache VirtualHost設定中..."
    
    # メインドメイン用設定
    cat > "/etc/apache2/sites-available/$DOMAIN.conf" << EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    ServerAlias www.$DOMAIN
    DocumentRoot /srv/www/htdocs/$DOMAIN
    
    # ログ設定
    ErrorLog /var/log/apache2/$DOMAIN-error.log
    CustomLog /var/log/apache2/$DOMAIN-access.log combined
    
    # Let's Encryptの認証用
    Alias /.well-known/acme-challenge/ /srv/www/htdocs/.well-known/acme-challenge/
    <Directory "/srv/www/htdocs/.well-known">
        AllowOverride None
        Require all granted
    </Directory>
</VirtualHost>
EOF

    # ステータスページ用サブドメイン設定
    cat > "/etc/apache2/sites-available/$SUBDOMAIN.$DOMAIN.conf" << EOF
<VirtualHost *:80>
    ServerName $SUBDOMAIN.$DOMAIN
    DocumentRoot /srv/www/htdocs/$SUBDOMAIN
    
    # CORS設定（API接続用）
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    
    # ログ設定
    ErrorLog /var/log/apache2/$SUBDOMAIN.$DOMAIN-error.log
    CustomLog /var/log/apache2/$SUBDOMAIN.$DOMAIN-access.log combined
    
    # Let's Encryptの認証用
    Alias /.well-known/acme-challenge/ /srv/www/htdocs/.well-known/acme-challenge/
    <Directory "/srv/www/htdocs/.well-known">
        AllowOverride None
        Require all granted
    </Directory>
</VirtualHost>
EOF

    # ディレクトリ作成
    mkdir -p "/srv/www/htdocs/$DOMAIN"
    mkdir -p "/srv/www/htdocs/$SUBDOMAIN"
    mkdir -p "/srv/www/htdocs/.well-known/acme-challenge"
    
    # サイト有効化
    a2ensite "$DOMAIN"
    a2ensite "$SUBDOMAIN.$DOMAIN"
    a2enmod headers rewrite
    
    systemctl reload apache2
    print_success "Apache VirtualHost設定完了"
}

# ファイル配置
deploy_website_files() {
    print_message "📁 Webサイトファイルを配置中..."
    
    # ステータスページファイル配置
    if [ -d "/home/$(logname)/Aivis-chan-bot-web" ]; then
        SOURCE_DIR="/home/$(logname)/Aivis-chan-bot-web"
    elif [ -d "/tmp/Aivis-chan-bot-web" ]; then
        SOURCE_DIR="/tmp/Aivis-chan-bot-web"
    else
        print_warning "Webサイトファイルが見つかりません"
        print_message "手動でファイルを配置してください:"
        print_message "cp -r /path/to/Aivis-chan-bot-web/* /srv/www/htdocs/$SUBDOMAIN/"
        return
    fi
    
    # ファイルコピー
    cp -r "$SOURCE_DIR"/* "/srv/www/htdocs/$SUBDOMAIN/"
    chown -R wwwrun:www "/srv/www/htdocs/$SUBDOMAIN"
    chmod -R 644 "/srv/www/htdocs/$SUBDOMAIN"
    find "/srv/www/htdocs/$SUBDOMAIN" -type d -exec chmod 755 {} \;
    
    # メインドメイン用シンプルページ
    cat > "/srv/www/htdocs/$DOMAIN/index.html" << EOF
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aivis-chan Bot</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; color: white; }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        p { font-size: 1.2rem; margin-bottom: 2rem; }
        .btn { display: inline-block; padding: 12px 24px; background: rgba(255,255,255,0.2); color: white; text-decoration: none; border-radius: 25px; border: 2px solid rgba(255,255,255,0.3); transition: all 0.3s; }
        .btn:hover { background: rgba(255,255,255,0.3); }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Aivis-chan Bot</h1>
        <p>Discord音声合成ボットサービス</p>
        <a href="https://$SUBDOMAIN.$DOMAIN" class="btn">ステータスページ →</a>
    </div>
</body>
</html>
EOF
    
    chown wwwrun:www "/srv/www/htdocs/$DOMAIN/index.html"
    print_success "Webサイトファイル配置完了"
}

# SSL証明書取得（Cloudflare DNS認証）
obtain_ssl_certificate() {
    print_message "🔒 SSL証明書を取得中（Cloudflare DNS認証）..."
    
    # Cloudflare DNS認証でワイルドカード証明書取得
    certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 60 \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN,*.$DOMAIN"
    
    if [ $? -eq 0 ]; then
        print_success "SSL証明書取得成功"
    else
        print_error "SSL証明書取得失敗"
        exit 1
    fi
}

# Apache SSL設定
configure_apache_ssl() {
    print_message "🛡️  Apache SSL設定中..."
    
    # SSL モジュール有効化
    a2enmod ssl
    
    # メインドメインSSL設定
    cat > "/etc/apache2/sites-available/$DOMAIN-ssl.conf" << EOF
<VirtualHost *:443>
    ServerName $DOMAIN
    ServerAlias www.$DOMAIN
    DocumentRoot /srv/www/htdocs/$DOMAIN
    
    # SSL設定
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem
    
    # 強力なSSL設定
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
    SSLHonorCipherOrder off
    SSLSessionTickets off
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # ログ設定
    ErrorLog /var/log/apache2/$DOMAIN-ssl-error.log
    CustomLog /var/log/apache2/$DOMAIN-ssl-access.log combined
</VirtualHost>
EOF

    # ステータスページSSL設定
    cat > "/etc/apache2/sites-available/$SUBDOMAIN.$DOMAIN-ssl.conf" << EOF
<VirtualHost *:443>
    ServerName $SUBDOMAIN.$DOMAIN
    DocumentRoot /srv/www/htdocs/$SUBDOMAIN
    
    # SSL設定
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem
    
    # 強力なSSL設定
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
    SSLHonorCipherOrder off
    SSLSessionTickets off
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # CORS設定（API接続用）
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    
    # ログ設定
    ErrorLog /var/log/apache2/$SUBDOMAIN.$DOMAIN-ssl-error.log
    CustomLog /var/log/apache2/$SUBDOMAIN.$DOMAIN-ssl-access.log combined
</VirtualHost>
EOF

    # HTTPからHTTPSへのリダイレクト設定
    cat > "/etc/apache2/sites-available/redirect-ssl.conf" << EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    ServerAlias www.$DOMAIN $SUBDOMAIN.$DOMAIN
    Redirect permanent / https://$DOMAIN/
</VirtualHost>
EOF

    # SSL サイト有効化
    a2ensite "$DOMAIN-ssl"
    a2ensite "$SUBDOMAIN.$DOMAIN-ssl"
    a2ensite "redirect-ssl"
    
    # 元のHTTPサイト無効化
    a2dissite "$DOMAIN"
    a2dissite "$SUBDOMAIN.$DOMAIN"
    
    systemctl reload apache2
    print_success "Apache SSL設定完了"
}

# ファイアウォール設定
configure_firewall() {
    print_message "🔥 ファイアウォール設定中..."
    
    if systemctl is-active --quiet firewalld; then
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
        print_success "firewalld設定完了"
    elif command -v ufw >/dev/null; then
        ufw allow 'Apache Full'
        print_success "ufw設定完了"
    else
        print_warning "ファイアウォールが見つかりません - 手動でポート80/443を開放してください"
    fi
}

# 自動更新設定
setup_auto_renewal() {
    print_message "⏰ SSL証明書自動更新設定中..."
    
    # cron設定
    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload apache2") | crontab -
        print_success "cron自動更新設定完了"
    else
        print_message "自動更新は既に設定済みです"
    fi
}

# 接続テスト
test_connections() {
    print_message "🧪 接続テスト実行中..."
    
    sleep 5 # DNS伝播待ち
    
    # HTTPS接続テスト
    if curl -s --max-time 10 "https://$DOMAIN" >/dev/null 2>&1; then
        print_success "✅ メインサイト HTTPS接続成功: https://$DOMAIN"
    else
        print_warning "❌ メインサイト HTTPS接続失敗"
    fi
    
    if curl -s --max-time 10 "https://$SUBDOMAIN.$DOMAIN" >/dev/null 2>&1; then
        print_success "✅ ステータスページ HTTPS接続成功: https://$SUBDOMAIN.$DOMAIN"
    else
        print_warning "❌ ステータスページ HTTPS接続失敗"
    fi
    
    # SSL証明書確認
    echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -dates
}

# メイン処理実行
main() {
    print_message "🚀 Cloudflare + openSUSE Leap セットアップ開始"
    
    setup_cloudflare_credentials
    configure_firewall
    setup_apache_virtualhost
    deploy_website_files
    obtain_ssl_certificate
    configure_apache_ssl
    setup_auto_renewal
    test_connections
    
    print_success "🎉 セットアップ完了！"
    echo
    print_message "📋 セットアップ完了情報:"
    echo "🌐 メインサイト: https://$DOMAIN"
    echo "📊 ステータスページ: https://$SUBDOMAIN.$DOMAIN"
    echo "🔒 SSL証明書: Let's Encrypt (90日間有効)"
    echo "🔄 自動更新: 毎日午前3時"
    echo
    print_message "📝 次のステップ:"
    echo "1. CloudflareでSSL/TLS設定を 'Full (strict)' に変更"
    echo "2. Cloudflareのプロキシ（オレンジ雲）を有効化（推奨）"
    echo "3. CloudflareでCDN、DDoS保護を設定"
    echo "4. ステータスページの動作確認"
}

# スクリプト実行
main "$@"
