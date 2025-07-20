#!/bin/bash

# Apache設定クリーンアップスクリプト
# モジュール重複とSSL設定問題を解決

echo "🧹 Apache設定クリーンアップスクリプト"
echo "====================================="

DOMAIN="aivis-chan-bot.com"

# 1. Apache停止
echo "1. Apache停止中..."
sudo systemctl stop apache2

# 2. 既存の設定ファイルをバックアップ
echo "2. 設定ファイルバックアップ中..."
sudo cp -r /etc/apache2 /etc/apache2.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# 3. 重複するモジュール設定を確認・削除
echo "3. モジュール重複確認..."
echo "現在有効なモジュール:"
sudo a2enmod -l 2>/dev/null | grep -E "ssl|headers" || echo "モジュール情報取得失敗"

# 4. 既存のサイト設定を無効化
echo "4. 既存サイト設定無効化..."
sudo find /etc/apache2/sites-enabled/ -name "*.conf" -exec basename {} \; | while read site; do
    if [ "$site" != "000-default.conf" ]; then
        echo "無効化: $site"
        sudo rm -f "/etc/apache2/sites-enabled/$site" 2>/dev/null || true
    fi
done

# 5. 古い設定ファイルを削除
echo "5. 古い設定ファイル削除..."
sudo rm -f /etc/apache2/sites-available/aivis-chan-bot.com*.conf 2>/dev/null || true
sudo rm -f /etc/apache2/sites-available/status.aivis-chan-bot.com*.conf 2>/dev/null || true

# 6. メイン設定ファイルでServerNameを設定
echo "6. ServerName設定..."
if ! grep -q "ServerName" /etc/apache2/apache2.conf; then
    echo "ServerName $DOMAIN" | sudo tee -a /etc/apache2/apache2.conf > /dev/null
    echo "✅ ServerName追加"
else
    echo "ℹ️ ServerName既に設定済み"
fi

# 7. 必要なモジュールを確実に有効化
echo "7. 必要なモジュール有効化..."
if command -v a2enmod >/dev/null 2>&1; then
    sudo a2enmod ssl 2>/dev/null || echo "SSLモジュール有効化失敗（既に有効の可能性）"
    sudo a2enmod headers 2>/dev/null || echo "Headersモジュール有効化失敗（既に有効の可能性）"
    sudo a2enmod rewrite 2>/dev/null || echo "Rewriteモジュール有効化失敗（既に有効の可能性）"
else
    echo "ℹ️ a2enmodコマンド利用不可（openSUSE環境）"
    # openSUSE用の設定確認
    if [ -f /etc/sysconfig/apache2 ]; then
        if ! grep -q "ssl" /etc/sysconfig/apache2; then
            echo "APACHE_MODULES=\"ssl rewrite headers\"" | sudo tee -a /etc/sysconfig/apache2
        fi
    fi
fi

# 8. 新しいクリーンなSSL設定を作成
echo "8. 新しいSSL設定作成..."
sudo tee /etc/apache2/sites-available/aivis-chan-bot.conf > /dev/null << 'EOF'
# Aivis-chan Bot メインサイト

<VirtualHost *:80>
    ServerName aivis-chan-bot.com
    ServerAlias www.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs
    
    # HTTPSへリダイレクト
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
    
    ErrorLog /var/log/apache2/aivis-chan-bot_error.log
    CustomLog /var/log/apache2/aivis-chan-bot_access.log combined
</VirtualHost>

<VirtualHost *:443>
    ServerName aivis-chan-bot.com
    ServerAlias www.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs
    
    # SSL設定
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/aivis-chan-bot.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/aivis-chan-bot.com/privkey.pem
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options DENY
    Header always set X-XSS-Protection "1; mode=block"
    
    ErrorLog /var/log/apache2/aivis-chan-bot_ssl_error.log
    CustomLog /var/log/apache2/aivis-chan-bot_ssl_access.log combined
</VirtualHost>

# ステータスページ

<VirtualHost *:80>
    ServerName status.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/status
    
    # HTTPSへリダイレクト
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
    
    ErrorLog /var/log/apache2/status_error.log
    CustomLog /var/log/apache2/status_access.log combined
</VirtualHost>

<VirtualHost *:443>
    ServerName status.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/status
    
    # SSL設定
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/aivis-chan-bot.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/aivis-chan-bot.com/privkey.pem
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options DENY
    Header always set X-XSS-Protection "1; mode=block"
    
    ErrorLog /var/log/apache2/status_ssl_error.log
    CustomLog /var/log/apache2/status_ssl_access.log combined
</VirtualHost>
EOF

# 9. ディレクトリ作成
echo "9. ディレクトリ作成..."
sudo mkdir -p /srv/www/htdocs/status
sudo chown -R wwwrun:www /srv/www/htdocs 2>/dev/null || sudo chown -R apache:apache /srv/www/htdocs 2>/dev/null || true

# 10. サイト有効化
echo "10. サイト有効化..."
if command -v a2ensite >/dev/null 2>&1; then
    sudo a2ensite aivis-chan-bot.conf
else
    # openSUSE用
    sudo ln -sf /etc/apache2/sites-available/aivis-chan-bot.conf /etc/apache2/sites-enabled/ 2>/dev/null || true
fi

# 11. 設定テスト
echo "11. 設定テスト..."
sudo apache2ctl configtest

if [ $? -eq 0 ]; then
    echo "✅ 設定テスト成功"
    
    # 12. Apache起動
    echo "12. Apache起動..."
    sudo systemctl start apache2
    
    # 13. 起動確認
    sleep 2
    if systemctl is-active --quiet apache2; then
        echo "✅ Apache起動成功！"
        
        echo -e "\n📊 起動後確認:"
        echo "Apache状態:"
        systemctl status apache2 --no-pager | head -5
        
        echo -e "\nポート待機確認:"
        if command -v ss >/dev/null; then
            ss -tlnp | grep -E ":80|:443" || echo "ポート確認失敗"
        else
            netstat -tlnp | grep -E ":80|:443" || echo "ポート確認失敗"
        fi
        
        echo -e "\nVirtualHost確認:"
        sudo apache2ctl -S 2>/dev/null | grep -E "443|80|aivis" || echo "VirtualHost情報なし"
        
    else
        echo "❌ Apache起動失敗"
        echo "エラーログ:"
        sudo journalctl -xeu apache2.service --no-pager | tail -10
    fi
else
    echo "❌ 設定エラーあり。起動せずに終了。"
fi

echo -e "\n🎯 次のステップ:"
echo "1. Apache起動成功の場合:"
echo "   - ./cloudflare-diagnosis.sh を実行"
echo "   - ウェブサイトファイルを配置"
echo ""
echo "2. Apache起動失敗の場合:"
echo "   - sudo journalctl -xeu apache2.service でエラー確認"
echo "   - sudo apache2ctl configtest で設定再確認"
