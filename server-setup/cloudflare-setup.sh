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

# システム検出
detect_system() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION="$VERSION_ID"
    else
        OS_ID="unknown"
    fi
    
    # Apache設定パス検出
    if [ -d "/etc/apache2" ]; then
        APACHE_CONF_DIR="/etc/apache2"
        APACHE_SITES_DIR="/etc/apache2/sites-available"
        APACHE_ENABLED_DIR="/etc/apache2/sites-enabled"
        APACHE_SERVICE="apache2"
    elif [ -d "/etc/httpd" ]; then
        APACHE_CONF_DIR="/etc/httpd"
        APACHE_SITES_DIR="/etc/httpd/conf.d"
        APACHE_ENABLED_DIR="/etc/httpd/conf.d"
        APACHE_SERVICE="httpd"
    else
        print_error "Apache設定ディレクトリが見つかりません"
        exit 1
    fi
    
    print_message "🔍 検出されたシステム: $OS_ID $OS_VERSION"
    print_message "📁 Apache設定ディレクトリ: $APACHE_CONF_DIR"
}

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
zypper install -y certbot python3-certbot-apache python3-certbot-dns-cloudflare net-tools-deprecated curl >/dev/null 2>&1

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
    
    # Apache設定ディレクトリの確認
    if [ ! -d "$APACHE_SITES_DIR" ]; then
        mkdir -p "$APACHE_SITES_DIR"
        print_message "Apache sites-available ディレクトリを作成しました: $APACHE_SITES_DIR"
    fi
    
    # ドキュメントルートディレクトリ作成
    mkdir -p "/srv/www/htdocs/$DOMAIN"
    mkdir -p "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN"
    mkdir -p "/srv/www/htdocs/.well-known/acme-challenge"
    
    # メインドメイン用設定
    cat > "$APACHE_SITES_DIR/$DOMAIN.conf" << EOF
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
    cat > "$APACHE_SITES_DIR/$SUBDOMAIN.$DOMAIN.conf" << EOF
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

    # Apache必要モジュール有効化とサイト有効化
    if command -v a2enmod >/dev/null && command -v a2ensite >/dev/null; then
        # Debian/Ubuntu系
        a2enmod headers rewrite ssl
        a2ensite "$DOMAIN"
        a2ensite "$SUBDOMAIN.$DOMAIN"
        print_message "Debian/Ubuntu系: a2ensiteでサイトを有効化しました"
    else
        # openSUSE系 - 設定ファイルを直接include
        print_message "openSUSE系: 手動でサイト設定を有効化中..."
        
        # Apache main設定にIncludeを追加
        MAIN_CONF="/etc/apache2/httpd.conf"
        if [ -f "$MAIN_CONF" ]; then
            # 既に設定されているかチェック
            if ! grep -q "Include.*$DOMAIN.conf" "$MAIN_CONF"; then
                echo "Include $APACHE_SITES_DIR/$DOMAIN.conf" >> "$MAIN_CONF"
            fi
            if ! grep -q "Include.*$SUBDOMAIN.$DOMAIN.conf" "$MAIN_CONF"; then
                echo "Include $APACHE_SITES_DIR/$SUBDOMAIN.$DOMAIN.conf" >> "$MAIN_CONF"
            fi
        else
            # default-server.conf を使用
            DEFAULT_CONF="/etc/apache2/default-server.conf"
            if [ -f "$DEFAULT_CONF" ]; then
                if ! grep -q "Include.*$DOMAIN.conf" "$DEFAULT_CONF"; then
                    echo "Include $APACHE_SITES_DIR/$DOMAIN.conf" >> "$DEFAULT_CONF"
                fi
                if ! grep -q "Include.*$SUBDOMAIN.$DOMAIN.conf" "$DEFAULT_CONF"; then
                    echo "Include $APACHE_SITES_DIR/$SUBDOMAIN.$DOMAIN.conf" >> "$DEFAULT_CONF"
                fi
            fi
        fi
        
        print_message "openSUSE系: 設定ファイルを直接includeしました"
    fi
    
    # Apache設定テスト
    if $APACHE_SERVICE -t 2>/dev/null || apache2ctl configtest 2>/dev/null; then
        systemctl reload $APACHE_SERVICE
        print_success "Apache VirtualHost設定完了"
    else
        print_error "Apache設定にエラーがあります"
        return 1
    fi
}

# ファイル配置
deploy_website_files() {
    print_message "📁 Webサイトファイルを配置中..."

    # メインサイトファイル配置（完全版）
    if [ -d "/home/$(logname)/Aivis-chan-bot-web" ]; then
        SOURCE_DIR="/home/$(logname)/Aivis-chan-bot-web"
    elif [ -d "/tmp/Aivis-chan-bot-web" ]; then
        SOURCE_DIR="/tmp/Aivis-chan-bot-web"
    else
        print_warning "Webサイトファイルが見つかりません"
        print_message "手動でファイルを配置してください"
        return
    fi

    # メインサイト用ファイルコピー（完全版サイト）
    if [ -f "$SOURCE_DIR/index-main.html" ]; then
        cp "$SOURCE_DIR/index-main.html" "/srv/www/htdocs/$DOMAIN/index.html"
    elif [ -f "$SOURCE_DIR/index.html" ]; then
        cp "$SOURCE_DIR/index.html" "/srv/www/htdocs/$DOMAIN/"
    fi
    
    # CSS・JS・画像・PWAファイルをメインサイトにコピー
    if [ -d "$SOURCE_DIR/css" ]; then
        cp -r "$SOURCE_DIR/css" "/srv/www/htdocs/$DOMAIN/"
    fi
    if [ -d "$SOURCE_DIR/js" ]; then
        cp -r "$SOURCE_DIR/js" "/srv/www/htdocs/$DOMAIN/"
    fi
    if [ -d "$SOURCE_DIR/images" ]; then
        cp -r "$SOURCE_DIR/images" "/srv/www/htdocs/$DOMAIN/"
    fi
    if [ -f "$SOURCE_DIR/manifest.json" ]; then
        cp "$SOURCE_DIR/manifest.json" "/srv/www/htdocs/$DOMAIN/"
    fi
    if [ -f "$SOURCE_DIR/sw.js" ]; then
        cp "$SOURCE_DIR/sw.js" "/srv/www/htdocs/$DOMAIN/"
    fi
    if [ -f "$SOURCE_DIR/offline.html" ]; then
        cp "$SOURCE_DIR/offline.html" "/srv/www/htdocs/$DOMAIN/"
    fi
    
    # ステータスページ用ファイルコピー
    if [ -f "$SOURCE_DIR/index.html" ]; then
        cp "$SOURCE_DIR/index.html" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN/"
    fi
    if [ -d "$SOURCE_DIR/css" ]; then
        cp -r "$SOURCE_DIR/css" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN/"
    fi
    if [ -d "$SOURCE_DIR/js" ]; then
        cp -r "$SOURCE_DIR/js" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN/"
    fi
    if [ -d "$SOURCE_DIR/images" ]; then
        cp -r "$SOURCE_DIR/images" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN/"
    fi
    
    # 権限設定
    chown -R wwwrun:www "/srv/www/htdocs/$DOMAIN" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN"
    chmod -R 644 "/srv/www/htdocs/$DOMAIN" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN"
    find "/srv/www/htdocs/$DOMAIN" "/srv/www/htdocs/$SUBDOMAIN.$DOMAIN" -type d -exec chmod 755 {} \;
    
    print_success "✅ メインサイト（完全版）を配置しました"
    print_success "✅ ステータスページファイル配置完了"
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
    if command -v a2enmod >/dev/null; then
        a2enmod ssl
        print_message "a2enmodでSSLモジュールを有効化しました"
    else
        # openSUSE系でSSLモジュール有効化
        print_message "openSUSE系: SSLモジュール有効化中..."
        
        # SSLモジュール有効化
        if [ -f "/etc/apache2/sysconfig.d/loadmodule.conf" ]; then
            if ! grep -q "LoadModule ssl_module" "/etc/apache2/sysconfig.d/loadmodule.conf"; then
                echo "LoadModule ssl_module /usr/lib64/apache2-prefork/mod_ssl.so" >> "/etc/apache2/sysconfig.d/loadmodule.conf"
            fi
        elif [ -f "/etc/apache2/loadmodule.conf" ]; then
            if ! grep -q "LoadModule ssl_module" "/etc/apache2/loadmodule.conf"; then
                echo "LoadModule ssl_module /usr/lib64/apache2-prefork/mod_ssl.so" >> "/etc/apache2/loadmodule.conf"
            fi
        fi
        
        # Listen 443ディレクティブ確認・追加
        LISTEN_CONF="/etc/apache2/listen.conf"
        if [ -f "$LISTEN_CONF" ]; then
            if ! grep -q "Listen 443" "$LISTEN_CONF"; then
                echo "Listen 443 ssl" >> "$LISTEN_CONF"
                print_message "Listen 443を追加しました"
            fi
        else
            # httpd.confに直接追加
            if ! grep -q "Listen 443" "$APACHE_CONF_DIR/httpd.conf"; then
                echo "Listen 443 ssl" >> "$APACHE_CONF_DIR/httpd.conf"
                print_message "httpd.confにListen 443を追加しました"
            fi
        fi
        
        print_message "openSUSE系: SSLモジュールを手動で有効化しました"
    fi
    
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
    cat > "$APACHE_SITES_DIR/redirect-ssl.conf" << EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    ServerAlias www.$DOMAIN $SUBDOMAIN.$DOMAIN
    Redirect permanent / https://$DOMAIN/
</VirtualHost>
EOF

    # SSL サイト有効化
    if command -v a2ensite >/dev/null; then
        # Debian/Ubuntu系
        a2ensite "$DOMAIN-ssl"
        a2ensite "$SUBDOMAIN.$DOMAIN-ssl"
        a2ensite "redirect-ssl"
        
        # 元のHTTPサイト無効化
        a2dissite "$DOMAIN" 2>/dev/null || true
        a2dissite "$SUBDOMAIN.$DOMAIN" 2>/dev/null || true
        
        print_message "Debian/Ubuntu系: a2ensiteでSSLサイトを有効化しました"
    else
        # openSUSE系 - 設定ファイルを直接include
        print_message "openSUSE系: SSL設定を手動で有効化中..."
        
        # Apache main設定にSSL設定を追加
        MAIN_CONF="/etc/apache2/httpd.conf"
        if [ -f "$MAIN_CONF" ]; then
            # 既存のHTTP設定をコメントアウト
            sed -i "s/^Include.*$DOMAIN.conf$/# &/" "$MAIN_CONF"
            sed -i "s/^Include.*$SUBDOMAIN.$DOMAIN.conf$/# &/" "$MAIN_CONF"
            
            # SSL設定を追加
            if ! grep -q "Include.*$DOMAIN-ssl.conf" "$MAIN_CONF"; then
                echo "Include $APACHE_SITES_DIR/$DOMAIN-ssl.conf" >> "$MAIN_CONF"
            fi
            if ! grep -q "Include.*$SUBDOMAIN.$DOMAIN-ssl.conf" "$MAIN_CONF"; then
                echo "Include $APACHE_SITES_DIR/$SUBDOMAIN.$DOMAIN-ssl.conf" >> "$MAIN_CONF"
            fi
            if ! grep -q "Include.*redirect-ssl.conf" "$MAIN_CONF"; then
                echo "Include $APACHE_SITES_DIR/redirect-ssl.conf" >> "$MAIN_CONF"
            fi
        else
            # default-server.conf を使用
            DEFAULT_CONF="/etc/apache2/default-server.conf"
            if [ -f "$DEFAULT_CONF" ]; then
                # 既存のHTTP設定をコメントアウト
                sed -i "s/^Include.*$DOMAIN.conf$/# &/" "$DEFAULT_CONF"
                sed -i "s/^Include.*$SUBDOMAIN.$DOMAIN.conf$/# &/" "$DEFAULT_CONF"
                
                # SSL設定を追加
                if ! grep -q "Include.*$DOMAIN-ssl.conf" "$DEFAULT_CONF"; then
                    echo "Include $APACHE_SITES_DIR/$DOMAIN-ssl.conf" >> "$DEFAULT_CONF"
                fi
                if ! grep -q "Include.*$SUBDOMAIN.$DOMAIN-ssl.conf" "$DEFAULT_CONF"; then
                    echo "Include $APACHE_SITES_DIR/$SUBDOMAIN.$DOMAIN-ssl.conf" >> "$DEFAULT_CONF"
                fi
                if ! grep -q "Include.*redirect-ssl.conf" "$DEFAULT_CONF"; then
                    echo "Include $APACHE_SITES_DIR/redirect-ssl.conf" >> "$DEFAULT_CONF"
                fi
            fi
        fi
        
        print_message "openSUSE系: SSL設定ファイルを直接includeしました"
    fi
    
    # Apache設定テスト
    print_message "🔍 Apache設定テスト中..."
    if $APACHE_SERVICE -t 2>/dev/null || apache2ctl configtest 2>/dev/null; then
        print_success "✅ Apache設定テスト成功"
    else
        print_error "❌ Apache設定テストエラー"
        apache2ctl configtest
        return 1
    fi
    
    # Apache再読み込み（設定反映）
    systemctl reload $APACHE_SERVICE
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
    
    # Apache再起動（SSL設定反映のため）
    print_message "🔄 Apache再起動中（SSL設定反映）..."
    systemctl restart $APACHE_SERVICE
    sleep 3
    
    # Apache状態確認
    if systemctl is-active --quiet $APACHE_SERVICE; then
        print_success "✅ Apache起動確認"
    else
        print_error "❌ Apache起動失敗"
        systemctl status $APACHE_SERVICE
        return 1
    fi
    
    # ポート確認
    print_message "🔍 ポート確認中..."
    
    # netstatの代わりにssコマンドを使用（openSUSE対応）
    if command -v netstat >/dev/null; then
        PORT_CHECK_CMD="netstat -tlnp"
    elif command -v ss >/dev/null; then
        PORT_CHECK_CMD="ss -tlnp"
    else
        print_warning "⚠️  ポート確認コマンドが見つかりません"
        return
    fi
    
    if $PORT_CHECK_CMD | grep -q ":443.*apache2\|:443.*httpd"; then
        print_success "✅ ポート443でApacheが待機中"
    else
        print_warning "⚠️  ポート443でApacheが見つかりません"
        print_message "ポート443の詳細:"
        $PORT_CHECK_CMD | grep ":443" || echo "ポート443で待機中のプロセスはありません"
        
        # 追加デバッグ: Apache プロセス確認
        print_message "Apache プロセス確認:"
        ps aux | grep -E 'apache2|httpd' | grep -v grep || echo "Apache プロセスが見つかりません"
    fi
    
    # 設定ファイル構文確認
    print_message "🔍 Apache設定確認中..."
    if $APACHE_SERVICE -t 2>/dev/null || apache2ctl configtest 2>/dev/null; then
        print_success "✅ Apache設定OK"
    else
        print_error "❌ Apache設定エラー"
        apache2ctl configtest
    fi
    
    sleep 5 # DNS伝播待ち
    
    # ローカル接続テスト
    print_message "🔍 ローカル接続テスト中..."
    if curl -k -s --max-time 10 "https://localhost" >/dev/null 2>&1; then
        print_success "✅ ローカルHTTPS接続成功"
    else
        print_warning "❌ ローカルHTTPS接続失敗"
        # 詳細エラー表示
        curl -k -v --max-time 10 "https://localhost" 2>&1 | head -20
    fi
    
    # 外部接続テスト
    print_message "🔍 外部接続テスト中..."
    if curl -s --max-time 10 "https://$DOMAIN" >/dev/null 2>&1; then
        print_success "✅ メインサイト HTTPS接続成功: https://$DOMAIN"
    else
        print_warning "❌ メインサイト HTTPS接続失敗"
        print_message "詳細デバッグ情報:"
        curl -v --max-time 10 "https://$DOMAIN" 2>&1 | head -10
    fi
    
    if curl -s --max-time 10 "https://$SUBDOMAIN.$DOMAIN" >/dev/null 2>&1; then
        print_success "✅ ステータスページ HTTPS接続成功: https://$SUBDOMAIN.$DOMAIN"
    else
        print_warning "❌ ステータスページ HTTPS接続失敗"
        print_message "詳細デバッグ情報:"
        curl -v --max-time 10 "https://$SUBDOMAIN.$DOMAIN" 2>&1 | head -10
    fi
    
    # SSL証明書確認（修正版）
    print_message "🔍 SSL証明書確認中..."
    if timeout 10 bash -c "echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null" | openssl x509 -noout -dates 2>/dev/null; then
        print_success "✅ SSL証明書確認成功"
    else
        print_warning "⚠️  SSL証明書確認に問題があります"
        # より詳細な証明書確認
        echo "証明書ファイル確認:"
        ls -la /etc/letsencrypt/live/$DOMAIN/ 2>/dev/null || echo "証明書ファイルが見つかりません"
        
        # ファイアウォール確認
        print_message "ファイアウォール確認:"
        if command -v firewall-cmd >/dev/null; then
            firewall-cmd --list-services
        elif command -v ufw >/dev/null; then
            ufw status
        fi
    fi
}

# メイン処理実行
main() {
    print_message "🚀 Cloudflare + openSUSE Leap セットアップ開始"
    
    # システム検出
    detect_system
    
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
