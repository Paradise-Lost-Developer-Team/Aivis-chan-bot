#!/bin/bash

# SSL証明書取得スクリプト (Let's Encrypt with Certbot)
# openSUSE Leap 15.6 用

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

# rootユーザーチェック
if [ "$EUID" -ne 0 ]; then
    print_error "このスクリプトはroot権限で実行してください"
    echo "使用方法: sudo $0 <ドメイン名> [メールアドレス]"
    exit 1
fi

# 引数チェック
if [ $# -lt 1 ]; then
    print_error "ドメイン名が指定されていません"
    echo "使用方法: sudo $0 <ドメイン名> [メールアドレス]"
    echo "例: sudo $0 alecjp02.asuscomm.com admin@example.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="${2:-admin@$DOMAIN}"

print_message "SSL証明書取得を開始します"
print_message "ドメイン: $DOMAIN"
print_message "メールアドレス: $EMAIL"

# 必要なパッケージのインストール
print_message "Certbot及び関連パッケージをインストールしています..."

# openSUSE用のcertbotインストール
if ! command -v certbot &> /dev/null; then
    zypper refresh
    zypper install -y certbot python3-certbot-apache
fi

# Apacheが動作しているかチェック
if ! systemctl is-active --quiet apache2; then
    print_warning "Apacheが動作していません。先にApacheを起動します..."
    systemctl start apache2
    systemctl enable apache2
fi

# ファイアウォール設定確認
print_message "ファイアウォール設定を確認しています..."
if command -v firewall-cmd &> /dev/null; then
    # firewalldの場合
    if systemctl is-active --quiet firewalld; then
        print_message "HTTP/HTTPSポートを開放しています..."
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
    fi
elif command -v ufw &> /dev/null; then
    # ufwの場合
    ufw allow 'Apache Full'
elif command -v iptables &> /dev/null; then
    # iptablesの場合（基本的な設定）
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT
fi

# ドメインの疎通確認
print_message "ドメインの疎通確認を行っています..."
if ! curl -s --max-time 10 "http://$DOMAIN" > /dev/null; then
    print_warning "ドメイン $DOMAIN への接続に失敗しました"
    print_warning "以下を確認してください:"
    print_warning "1. DNSレコードが正しく設定されているか"
    print_warning "2. ポート80が開放されているか"
    print_warning "3. Webサーバーが正常に動作しているか"
    
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_message "処理を中断しました"
        exit 0
    fi
fi

# Let's Encryptの利用規約確認
print_message "Let's Encryptの利用規約に同意して証明書を取得します..."

# 証明書取得方法の選択
echo "証明書取得方法を選択してください:"
echo "1) Webサーバーを使用した認証 (推奨)"
echo "2) スタンドアロン認証 (Webサーバーを一時停止)"
echo "3) DNSチャレンジ (手動)"
read -p "選択 (1-3): " -n 1 -r
echo

case $REPLY in
    1)
        # Webサーバー認証
        print_message "Webサーバー認証で証明書を取得しています..."
        certbot --apache \
            --non-interactive \
            --agree-tos \
            --email "$EMAIL" \
            --domains "$DOMAIN" \
            --redirect
        ;;
    2)
        # スタンドアロン認証
        print_message "スタンドアロン認証で証明書を取得しています..."
        print_message "一時的にApacheを停止します..."
        systemctl stop apache2
        
        certbot certonly \
            --standalone \
            --non-interactive \
            --agree-tos \
            --email "$EMAIL" \
            --domains "$DOMAIN"
        
        # Apache再起動とSSL設定
        print_message "Apacheを再起動してSSL設定を適用します..."
        systemctl start apache2
        configure_apache_ssl "$DOMAIN"
        ;;
    3)
        # DNSチャレンジ
        print_message "DNSチャレンジで証明書を取得しています..."
        certbot certonly \
            --manual \
            --preferred-challenges dns \
            --email "$EMAIL" \
            --domains "$DOMAIN"
        
        configure_apache_ssl "$DOMAIN"
        ;;
    *)
        print_error "無効な選択です"
        exit 1
        ;;
esac

# Apache SSL設定関数
configure_apache_ssl() {
    local domain="$1"
    local cert_path="/etc/letsencrypt/live/$domain"
    
    print_message "Apache SSL設定を構成しています..."
    
    # SSL設定ファイルの作成
    cat > "/etc/apache2/sites-available/$domain-ssl.conf" << EOF
<VirtualHost *:443>
    ServerName $domain
    DocumentRoot /srv/www/htdocs
    
    # SSL設定
    SSLEngine on
    SSLCertificateFile $cert_path/fullchain.pem
    SSLCertificateKeyFile $cert_path/privkey.pem
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    
    # CORS設定（Aivis-chanボット用）
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    
    # ログ設定
    ErrorLog /var/log/apache2/$domain-ssl-error.log
    CustomLog /var/log/apache2/$domain-ssl-access.log combined
</VirtualHost>

# HTTP to HTTPS リダイレクト
<VirtualHost *:80>
    ServerName $domain
    Redirect permanent / https://$domain/
</VirtualHost>
EOF
    
    # サイトを有効化
    a2ensite "$domain-ssl"
    a2enmod ssl headers rewrite
    systemctl reload apache2
}

# 証明書の自動更新設定
setup_auto_renewal() {
    print_message "証明書の自動更新を設定しています..."
    
    # cronジョブの設定
    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet && systemctl reload apache2") | crontab -
        print_message "証明書の自動更新が設定されました（毎日12:00に実行）"
    else
        print_message "証明書の自動更新は既に設定されています"
    fi
}

# 証明書の状態確認
check_certificate() {
    print_message "証明書の状態を確認しています..."
    
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        echo "証明書ファイル: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        echo "秘密鍵ファイル: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
        
        # 証明書の有効期限確認
        echo "証明書の有効期限:"
        openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" -noout -dates
        
        # SSL接続テスト
        print_message "SSL接続テストを実行しています..."
        if curl -s --max-time 10 "https://$DOMAIN" > /dev/null; then
            print_message "✅ SSL接続成功"
        else
            print_warning "❌ SSL接続に失敗しました"
        fi
    else
        print_error "証明書ファイルが見つかりません"
        exit 1
    fi
}

# メイン処理実行
if certbot certificates | grep -q "$DOMAIN"; then
    print_message "ドメイン $DOMAIN の証明書は既に存在します"
    read -p "証明書を更新しますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        certbot renew --force-renewal
    fi
else
    print_message "新しい証明書を取得します"
fi

# 自動更新設定
setup_auto_renewal

# 証明書確認
check_certificate

print_message "SSL証明書の設定が完了しました！"
print_message "HTTPSでアクセスできます: https://$DOMAIN"

# セキュリティ推奨事項の表示
echo
print_message "セキュリティ推奨事項:"
echo "1. 定期的にシステムアップデートを実行してください"
echo "2. 不要なポートを閉じてください"
echo "3. Fail2banなどの侵入検知システムを導入してください"
echo "4. ログの監視を行ってください"
echo
print_message "SSL設定完了！"
