#!/bin/bash

# openSUSE Apache SSL修正スクリプト
# aivis-chan-bot.com用

DOMAIN="aivis-chan-bot.com"
SUBDOMAIN="status"

echo "🔧 openSUSE Apache SSL修正スクリプト"
echo "==============================="

# 必要なパッケージを確実にインストール
echo "1. 必要なパッケージのインストール..."
zypper install -y net-tools-deprecated curl apache2-mod_ssl >/dev/null 2>&1

# Apache設定の確認と修正
echo "2. Apache SSL設定の確認と修正..."

# SSLモジュール確認
echo "SSLモジュール状態確認:"
if apache2ctl -M 2>/dev/null | grep -q ssl; then
    echo "✅ SSLモジュール有効"
else
    echo "❌ SSLモジュール無効 - 有効化中..."
    
    # SSLモジュール強制有効化
    if [ -f "/etc/sysconfig/apache2" ]; then
        # APACHE_MODULESにsslを追加
        if ! grep -q "ssl" /etc/sysconfig/apache2; then
            sed -i 's/APACHE_MODULES="/APACHE_MODULES="ssl /' /etc/sysconfig/apache2
            echo "sysconfig/apache2にSSLモジュールを追加しました"
        fi
    fi
    
    # モジュール設定ファイル確認
    for conf_file in "/etc/apache2/sysconfig.d/loadmodule.conf" "/etc/apache2/loadmodule.conf"; do
        if [ -f "$conf_file" ]; then
            if ! grep -q "LoadModule ssl_module" "$conf_file"; then
                echo "LoadModule ssl_module /usr/lib64/apache2/mod_ssl.so" >> "$conf_file"
                echo "$conf_file にSSLモジュールを追加しました"
            fi
        fi
    done
fi

# Listen 443設定確認
echo "Listen 443設定確認:"
LISTEN_FILES=("/etc/apache2/listen.conf" "/etc/apache2/httpd.conf" "/etc/apache2/ports.conf")
LISTEN_FOUND=false

for file in "${LISTEN_FILES[@]}"; do
    if [ -f "$file" ] && grep -q "Listen 443" "$file"; then
        echo "✅ $file にListen 443設定あり"
        LISTEN_FOUND=true
        break
    fi
done

if [ "$LISTEN_FOUND" = false ]; then
    echo "❌ Listen 443設定なし - 追加中..."
    # 最適なファイルにListen 443を追加
    if [ -f "/etc/apache2/listen.conf" ]; then
        echo "Listen 443 ssl" >> "/etc/apache2/listen.conf"
        echo "listen.conf にListen 443を追加しました"
    else
        echo "Listen 443 ssl" >> "/etc/apache2/httpd.conf"
        echo "httpd.conf にListen 443を追加しました"
    fi
fi

# SSL設定ファイルのパス修正
echo "3. SSL設定ファイルのパス修正..."

SSL_CONFIGS=(
    "/etc/apache2/sites-available/$DOMAIN-ssl.conf"
    "/etc/apache2/sites-available/$SUBDOMAIN.$DOMAIN-ssl.conf"
)

for config in "${SSL_CONFIGS[@]}"; do
    if [ -f "$config" ]; then
        echo "修正中: $config"
        
        # DocumentRoot修正
        if grep -q "DocumentRoot /srv/www/htdocs/$SUBDOMAIN" "$config"; then
            sed -i "s|DocumentRoot /srv/www/htdocs/$SUBDOMAIN|DocumentRoot /srv/www/htdocs/$SUBDOMAIN.$DOMAIN|g" "$config"
            echo "DocumentRootを修正しました"
        fi
        
        # SSL証明書パス確認
        if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
            echo "⚠️  SSL証明書ファイルが見つかりません: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        fi
    else
        echo "⚠️  設定ファイルが見つかりません: $config"
    fi
done

# Include設定の確認と修正
echo "4. Include設定の確認と修正..."

APACHE_CONFIGS=("/etc/apache2/httpd.conf" "/etc/apache2/default-server.conf")

for conf in "${APACHE_CONFIGS[@]}"; do
    if [ -f "$conf" ]; then
        echo "処理中: $conf"
        
        # SSL設定のInclude追加
        for ssl_config in "${SSL_CONFIGS[@]}"; do
            config_name=$(basename "$ssl_config")
            if [ -f "$ssl_config" ] && ! grep -q "Include.*$config_name" "$conf"; then
                echo "Include $ssl_config" >> "$conf"
                echo "$conf に $config_name を追加しました"
            fi
        done
        
        # redirect-ssl.conf のInclude追加
        if [ -f "/etc/apache2/sites-available/redirect-ssl.conf" ] && ! grep -q "Include.*redirect-ssl.conf" "$conf"; then
            echo "Include /etc/apache2/sites-available/redirect-ssl.conf" >> "$conf"
            echo "$conf に redirect-ssl.conf を追加しました"
        fi
    fi
done

# Apache設定テスト
echo "5. Apache設定テスト..."
if apache2ctl configtest 2>/dev/null; then
    echo "✅ Apache設定OK"
else
    echo "❌ Apache設定エラー - 詳細:"
    apache2ctl configtest
fi

# Apache再起動
echo "6. Apache再起動..."

# まずApache停止
systemctl stop apache2
sleep 2

# Apache設定の最終確認
echo "Apache設定最終確認:"
if apache2ctl configtest; then
    echo "✅ Apache設定テスト成功"
else
    echo "❌ Apache設定テストエラー - 修正が必要です"
    apache2ctl configtest
    echo "設定エラーがあるため、基本的なSSL設定を再作成します..."
    
    # 基本的なSSL設定を作成
    cat > "/etc/apache2/conf.d/ssl-basic.conf" << EOF
# SSL基本設定
LoadModule ssl_module /usr/lib64/apache2/mod_ssl.so
Listen 443 ssl

# SSL証明書設定
SSLEngine on
SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem

# 強力なSSL設定
SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
SSLHonorCipherOrder off

<VirtualHost *:443>
    ServerName $DOMAIN
    ServerAlias www.$DOMAIN
    DocumentRoot /srv/www/htdocs/$DOMAIN
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem
    
    ErrorLog /var/log/apache2/$DOMAIN-ssl-error.log
    CustomLog /var/log/apache2/$DOMAIN-ssl-access.log combined
</VirtualHost>

<VirtualHost *:443>
    ServerName $SUBDOMAIN.$DOMAIN
    DocumentRoot /srv/www/htdocs/$SUBDOMAIN.$DOMAIN
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem
    
    ErrorLog /var/log/apache2/$SUBDOMAIN.$DOMAIN-ssl-error.log
    CustomLog /var/log/apache2/$SUBDOMAIN.$DOMAIN-ssl-access.log combined
</VirtualHost>
EOF
    echo "基本的なSSL設定を作成しました: /etc/apache2/conf.d/ssl-basic.conf"
fi

# Apache起動
systemctl start apache2
sleep 3

if systemctl is-active --quiet apache2; then
    echo "✅ Apache再起動成功"
    
    # Apache設定情報表示
    echo "Apache設定情報:"
    apache2ctl -S 2>/dev/null | grep -E "VirtualHost|port" || echo "VirtualHost情報を取得できませんでした"
else
    echo "❌ Apache再起動失敗"
    echo "Apache状態:"
    systemctl status apache2
    echo "Apache エラーログ:"
    tail -10 /var/log/apache2/error_log 2>/dev/null || echo "エラーログが見つかりません"
fi

# ポート確認
echo "7. ポート確認..."

echo "全ポート確認:"
if command -v ss >/dev/null; then
    echo "ポート80確認:"
    ss -tlnp | grep ":80" || echo "ポート80で待機中のプロセスはありません"
    echo "ポート443確認:"
    ss -tlnp | grep ":443" || echo "ポート443で待機中のプロセスはありません"
    echo "Apache関連プロセス確認:"
    ss -tlnp | grep -E "apache2|httpd" || echo "Apache関連プロセスが見つかりません"
elif command -v netstat >/dev/null; then
    echo "ポート80確認:"
    netstat -tlnp | grep ":80" || echo "ポート80で待機中のプロセスはありません"
    echo "ポート443確認:"
    netstat -tlnp | grep ":443" || echo "ポート443で待機中のプロセスはありません"
    echo "Apache関連プロセス確認:"
    netstat -tlnp | grep -E "apache2|httpd" || echo "Apache関連プロセスが見つかりません"
else
    echo "⚠️  ポート確認コマンドが見つかりません"
fi

# プロセス確認
echo "Apache プロセス確認:"
ps aux | grep -E '[a]pache2|[h]ttpd' || echo "Apache プロセスが見つかりません"

# ファイアウォール確認
echo "ファイアウォール確認:"
if systemctl is-active --quiet firewalld; then
    echo "firewalld状態:"
    firewall-cmd --list-services 2>/dev/null || echo "firewalld情報取得失敗"
    firewall-cmd --list-ports 2>/dev/null || echo "ポート情報取得失敗"
elif command -v ufw >/dev/null; then
    echo "ufw状態:"
    ufw status || echo "ufw情報取得失敗"
else
    echo "ファイアウォール未検出"
fi

# 接続テスト
echo "8. 接続テスト..."

# まずHTTP接続テスト
echo "HTTP接続テスト（ポート80）:"
if curl -s --max-time 5 "http://localhost" >/dev/null 2>&1; then
    echo "✅ HTTP接続成功"
else
    echo "❌ HTTP接続失敗"
    echo "HTTP詳細エラー:"
    curl -v --max-time 5 "http://localhost" 2>&1 | head -5
fi

# HTTPS接続テスト
echo "HTTPS接続テスト（ポート443）:"
if curl -k -s --max-time 5 "https://localhost" >/dev/null 2>&1; then
    echo "✅ ローカルHTTPS接続成功"
else
    echo "❌ ローカルHTTPS接続失敗"
    echo "HTTPS詳細エラー:"
    curl -k -v --max-time 5 "https://localhost" 2>&1 | head -10
    
    # 追加デバッグ
    echo -e "\n追加デバッグ情報:"
    echo "SSL証明書ファイル確認:"
    ls -la /etc/letsencrypt/live/$DOMAIN/ 2>/dev/null || echo "証明書ディレクトリが見つかりません"
    
    echo "Apache設定ファイルの構文チェック:"
    apache2ctl -t -D DUMP_VHOSTS 2>/dev/null || echo "VirtualHost情報取得失敗"
    
    echo "最近のApacheエラーログ:"
    tail -5 /var/log/apache2/error_log 2>/dev/null || tail -5 /var/log/apache2/error.log 2>/dev/null || echo "エラーログが見つかりません"
fi

# 外部ドメイン接続テスト（DNS解決確認）
echo -e "\n外部ドメイン接続テスト:"
echo "DNS解決確認:"
if command -v dig >/dev/null; then
    dig +short $DOMAIN || echo "DNS解決失敗"
elif command -v nslookup >/dev/null; then
    nslookup $DOMAIN | grep -A1 "Name:" || echo "DNS解決失敗"
else
    echo "DNS確認コマンドが見つかりません"
fi

echo -e "\n修正完了！"
echo "次のコマンドで最終確認を行ってください:"
echo "curl -I https://$DOMAIN"
echo "curl -I https://$SUBDOMAIN.$DOMAIN"
