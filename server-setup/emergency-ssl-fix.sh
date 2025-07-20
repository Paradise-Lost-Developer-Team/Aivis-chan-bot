#!/bin/bash

# openSUSE Apache 緊急修復スクリプト
# 基本的なSSL設定を最小構成で作成

DOMAIN="aivis-chan-bot.com"
SUBDOMAIN="status"

echo "🚨 openSUSE Apache 緊急修復スクリプト"
echo "=================================="

# Apache停止
echo "1. Apache停止中..."
systemctl stop apache2

# 既存の設定をバックアップ
echo "2. 設定バックアップ中..."
mkdir -p /root/apache-backup-$(date +%Y%m%d-%H%M%S)
cp -r /etc/apache2/ /root/apache-backup-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true

# SSL証明書確認
echo "3. SSL証明書確認..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "❌ SSL証明書が見つかりません"
    echo "先にSSL証明書を取得してください:"
    echo "certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --domains $DOMAIN,*.$DOMAIN"
    exit 1
else
    echo "✅ SSL証明書確認済み"
    echo "証明書有効期限:"
    openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem -noout -dates
fi

# 基本Apache設定クリーンアップ
echo "4. Apache基本設定クリーンアップ..."

# 既存の問題のある設定ファイルを削除
rm -f /etc/apache2/sites-available/*aivis-chan-bot.com* 2>/dev/null || true
rm -f /etc/apache2/conf.d/*aivis* 2>/dev/null || true

# httpd.confから過去のIncludeを削除
sed -i '/Include.*aivis-chan-bot\.com/d' /etc/apache2/httpd.conf 2>/dev/null || true
sed -i '/Include.*status\.aivis-chan-bot\.com/d' /etc/apache2/httpd.conf 2>/dev/null || true
sed -i '/Include.*redirect-ssl/d' /etc/apache2/httpd.conf 2>/dev/null || true

# default-server.confからも削除
sed -i '/Include.*aivis-chan-bot\.com/d' /etc/apache2/default-server.conf 2>/dev/null || true
sed -i '/Include.*status\.aivis-chan-bot\.com/d' /etc/apache2/default-server.conf 2>/dev/null || true
sed -i '/Include.*redirect-ssl/d' /etc/apache2/default-server.conf 2>/dev/null || true

echo "✅ 既存設定クリーンアップ完了"

# 最小限のSSL設定作成
echo "5. 最小限SSL設定作成..."

# SSL基本設定
cat > "/etc/apache2/conf.d/aivis-ssl.conf" << 'EOF'
# Aivis-chan Bot SSL設定
LoadModule ssl_module /usr/lib64/apache2/mod_ssl.so
LoadModule headers_module /usr/lib64/apache2/mod_headers.so

# SSL基本設定
Listen 443 ssl
SSLEngine on
SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
SSLCipherSuite ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
SSLHonorCipherOrder off

# メインサイト SSL
<VirtualHost *:443>
    ServerName aivis-chan-bot.com
    ServerAlias www.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/aivis-chan-bot.com
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/aivis-chan-bot.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/aivis-chan-bot.com/privkey.pem
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    
    ErrorLog /var/log/apache2/aivis-chan-bot.com-ssl-error.log
    CustomLog /var/log/apache2/aivis-chan-bot.com-ssl-access.log combined
</VirtualHost>

# ステータスページ SSL
<VirtualHost *:443>
    ServerName status.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/status.aivis-chan-bot.com
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/aivis-chan-bot.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/aivis-chan-bot.com/privkey.pem
    
    # CORS設定
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    
    ErrorLog /var/log/apache2/status.aivis-chan-bot.com-ssl-error.log
    CustomLog /var/log/apache2/status.aivis-chan-bot.com-ssl-access.log combined
</VirtualHost>

# HTTPからHTTPSリダイレクト
<VirtualHost *:80>
    ServerName aivis-chan-bot.com
    ServerAlias www.aivis-chan-bot.com status.aivis-chan-bot.com
    Redirect permanent / https://aivis-chan-bot.com/
</VirtualHost>
EOF

echo "✅ SSL設定作成完了: /etc/apache2/conf.d/aivis-ssl.conf"

# ディレクトリ作成
echo "6. ディレクトリ作成..."
mkdir -p /srv/www/htdocs/aivis-chan-bot.com
mkdir -p /srv/www/htdocs/status.aivis-chan-bot.com
chown -R wwwrun:www /srv/www/htdocs/

# テストページ作成
echo "7. テストページ作成..."
cat > "/srv/www/htdocs/aivis-chan-bot.com/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aivis-chan Bot - SSL Test</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 2rem; background: #f0f2f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .status { padding: 1rem; margin: 1rem 0; border-radius: 4px; text-align: center; }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Aivis-chan Bot</h1>
        <div class="status success">
            ✅ SSL接続テスト成功！
        </div>
        <div class="status info">
            🌐 メインサイトが正常に動作しています
        </div>
        <p><strong>現在時刻:</strong> <span id="time"></span></p>
        <p><strong>プロトコル:</strong> <span id="protocol"></span></p>
        <p><strong>ホスト:</strong> <span id="host"></span></p>
    </div>
    <script>
        document.getElementById('time').textContent = new Date().toLocaleString('ja-JP');
        document.getElementById('protocol').textContent = location.protocol;
        document.getElementById('host').textContent = location.host;
    </script>
</body>
</html>
EOF

cp "/srv/www/htdocs/aivis-chan-bot.com/index.html" "/srv/www/htdocs/status.aivis-chan-bot.com/index.html"

# Apache設定テスト
echo "8. Apache設定テスト..."
if apache2ctl configtest; then
    echo "✅ Apache設定テスト成功"
else
    echo "❌ Apache設定テストエラー"
    apache2ctl configtest
    exit 1
fi

# Apache起動
echo "9. Apache起動..."
systemctl start apache2
sleep 3

if systemctl is-active --quiet apache2; then
    echo "✅ Apache起動成功"
else
    echo "❌ Apache起動失敗"
    systemctl status apache2
    exit 1
fi

# 最終テスト
echo "10. 最終接続テスト..."

# ローカルテスト
echo "ローカル接続テスト:"
echo "HTTP接続テスト:"
curl -s -o /dev/null -w "HTTP %{http_code} - %{time_total}s\n" "http://localhost" || echo "HTTP接続失敗"

echo "HTTPS接続テスト:"
curl -k -s -o /dev/null -w "HTTPS %{http_code} - %{time_total}s\n" "https://localhost" || echo "HTTPS接続失敗"

# 外部接続テスト（サーバー自身から）
echo -e "\n外部ドメイン接続テスト（サーバーから）:"
echo "メインドメイン接続:"
curl -k -s -o /dev/null -w "HTTPS %{http_code} - %{time_total}s\n" "https://$DOMAIN" 2>/dev/null || echo "外部HTTPS接続失敗"

echo "ステータスページ接続:"
curl -k -s -o /dev/null -w "HTTPS %{http_code} - %{time_total}s\n" "https://$SUBDOMAIN.$DOMAIN" 2>/dev/null || echo "外部HTTPS接続失敗"

# ポート確認
echo -e "\nポート確認:"
if command -v ss >/dev/null; then
    echo "ポート443確認:"
    ss -tlnp | grep ":443" || echo "ポート443で待機中のプロセスはありません"
elif command -v netstat >/dev/null; then
    echo "ポート443確認:"
    netstat -tlnp | grep ":443" || echo "ポート443で待機中のプロセスはありません"
fi

# ファイアウォール確認
echo -e "\nファイアウォール確認:"
if systemctl is-active --quiet firewalld; then
    echo "firewalld設定:"
    firewall-cmd --list-services 2>/dev/null || echo "firewalld情報取得失敗"
    firewall-cmd --list-ports 2>/dev/null || echo "ポート情報取得失敗"
    
    # HTTPSサービス確認・追加
    if ! firewall-cmd --list-services | grep -q https; then
        echo "HTTPSサービスを追加中..."
        firewall-cmd --permanent --add-service=https
        firewall-cmd --permanent --add-service=http
        firewall-cmd --reload
        echo "✅ ファイアウォールにHTTP/HTTPS追加完了"
    fi
elif command -v ufw >/dev/null; then
    echo "ufw設定:"
    ufw status || echo "ufw情報取得失敗"
else
    echo "ファイアウォール未検出"
fi

# Apache VirtualHost確認
echo -e "\nApache VirtualHost確認:"
apache2ctl -S 2>/dev/null | grep -E "443|aivis" || echo "VirtualHost情報取得失敗"

echo -e "\n🎉 緊急修復完了！"
echo "次のURLでテストしてください:"
echo "- https://$DOMAIN"
echo "- https://$SUBDOMAIN.$DOMAIN"
echo "- http://$DOMAIN (HTTPSにリダイレクトされるはず)"

echo -e "\n📝 トラブルシューティング情報:"
echo "もし外部接続が失敗する場合："
echo "1. Cloudflareプロキシが有効になっていないか確認"
echo "2. DNSがサーバーIPを正しく指しているか確認"
echo "3. ファイアウォールでポート443が開放されているか確認"
echo "4. 'curl -k -I https://localhost' でローカル接続確認"
