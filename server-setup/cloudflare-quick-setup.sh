#!/bin/bash

# Cloudflare クイックセットアップ
# aivis-chan-bot.com ドメイン用簡易設定

echo "🌐 Cloudflare + aivis-chan-bot.com クイックセットアップ"
echo "=================================================="

# 設定確認
echo
echo "📋 設定前チェックリスト:"
echo "□ Cloudflareでaivis-chan-bot.comドメインを追加済み"
echo "□ DNS設定でサーバーIPアドレスを設定済み"
echo "□ Cloudflareプロキシを無効化（🔴 DNS only）"
echo "□ Cloudflare API Tokenを取得済み"
echo

read -p "すべて完了していますか？ (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cloudflareの設定を完了してから再実行してください"
    echo
    echo "📖 詳細な手順は CLOUDFLARE-SETUP.md を参照してください"
    exit 0
fi

# rootチェック
if [ "$EUID" -ne 0 ]; then
    echo "❌ root権限で実行してください: sudo $0"
    exit 1
fi

echo "🚀 セットアップを開始します..."

# 必要なパッケージインストール
echo "📦 パッケージインストール中..."
zypper refresh >/dev/null 2>&1
zypper install -y certbot python3-certbot-dns-cloudflare >/dev/null 2>&1

# API Token入力
echo
read -p "🔑 Cloudflare API Token: " -s CF_TOKEN
echo

# Cloudflare認証設定
mkdir -p /etc/letsencrypt
cat > /etc/letsencrypt/cloudflare.ini << EOF
dns_cloudflare_api_token = $CF_TOKEN
EOF
chmod 600 /etc/letsencrypt/cloudflare.ini

# ファイアウォール設定
echo "🔥 ファイアウォール設定..."
if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http >/dev/null 2>&1
    firewall-cmd --permanent --add-service=https >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1
fi

# Apache設定
echo "🌐 Apache設定中..."
a2enmod ssl headers rewrite >/dev/null 2>&1

# ディレクトリ作成
mkdir -p /srv/www/htdocs/aivis-chan-bot.com
mkdir -p /srv/www/htdocs/status

# メインサイト設定
cat > /etc/apache2/sites-available/aivis-chan-bot.com.conf << 'EOF'
<VirtualHost *:80>
    ServerName aivis-chan-bot.com
    ServerAlias www.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/aivis-chan-bot.com
    Redirect permanent / https://aivis-chan-bot.com/
</VirtualHost>
EOF

# ステータスページ設定
cat > /etc/apache2/sites-available/status.aivis-chan-bot.com.conf << 'EOF'
<VirtualHost *:80>
    ServerName status.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/status
    Redirect permanent / https://status.aivis-chan-bot.com/
</VirtualHost>
EOF

# SSL設定
cat > /etc/apache2/sites-available/aivis-chan-bot.com-ssl.conf << 'EOF'
<VirtualHost *:443>
    ServerName aivis-chan-bot.com
    ServerAlias www.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/aivis-chan-bot.com
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/aivis-chan-bot.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/aivis-chan-bot.com/privkey.pem
    
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    
    ErrorLog /var/log/apache2/aivis-chan-bot.com-ssl-error.log
    CustomLog /var/log/apache2/aivis-chan-bot.com-ssl-access.log combined
</VirtualHost>
EOF

cat > /etc/apache2/sites-available/status.aivis-chan-bot.com-ssl.conf << 'EOF'
<VirtualHost *:443>
    ServerName status.aivis-chan-bot.com
    DocumentRoot /srv/www/htdocs/status
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/aivis-chan-bot.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/aivis-chan-bot.com/privkey.pem
    
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options DENY
    Header always set X-Content-Type-Options nosniff
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    
    ErrorLog /var/log/apache2/status.aivis-chan-bot.com-ssl-error.log
    CustomLog /var/log/apache2/status.aivis-chan-bot.com-ssl-access.log combined
</VirtualHost>
EOF

# ファイル配置
echo "📁 ファイル配置中..."

# メインサイトファイル配置（完全版）
if [ -d "/home/$(logname)/Aivis-chan-bot-web" ]; then
    # メインサイト用ファイルコピー
    cp /home/$(logname)/Aivis-chan-bot-web/index-main.html /srv/www/htdocs/aivis-chan-bot.com/index.html
    
    # CSS・JS・画像をコピー
    cp -r /home/$(logname)/Aivis-chan-bot-web/css /srv/www/htdocs/aivis-chan-bot.com/
    cp -r /home/$(logname)/Aivis-chan-bot-web/js /srv/www/htdocs/aivis-chan-bot.com/
    cp -r /home/$(logname)/Aivis-chan-bot-web/images /srv/www/htdocs/aivis-chan-bot.com/
    cp /home/$(logname)/Aivis-chan-bot-web/manifest.json /srv/www/htdocs/aivis-chan-bot.com/
    cp /home/$(logname)/Aivis-chan-bot-web/sw.js /srv/www/htdocs/aivis-chan-bot.com/
    cp /home/$(logname)/Aivis-chan-bot-web/offline.html /srv/www/htdocs/aivis-chan-bot.com/
    
    echo "✅ メインサイト（完全版）を配置しました"
elif [ -d "/tmp/Aivis-chan-bot-web" ]; then
    # 同様の処理
    cp /tmp/Aivis-chan-bot-web/index-main.html /srv/www/htdocs/aivis-chan-bot.com/index.html
    cp -r /tmp/Aivis-chan-bot-web/css /srv/www/htdocs/aivis-chan-bot.com/
    cp -r /tmp/Aivis-chan-bot-web/js /srv/www/htdocs/aivis-chan-bot.com/
    cp -r /tmp/Aivis-chan-bot-web/images /srv/www/htdocs/aivis-chan-bot.com/
    cp /tmp/Aivis-chan-bot-web/manifest.json /srv/www/htdocs/aivis-chan-bot.com/
    cp /tmp/Aivis-chan-bot-web/sw.js /srv/www/htdocs/aivis-chan-bot.com/
    cp /tmp/Aivis-chan-bot-web/offline.html /srv/www/htdocs/aivis-chan-bot.com/
    
    echo "✅ メインサイト（完全版）を配置しました"
else
    echo "⚠️  Webサイトファイルが見つかりません"
    echo "簡易版のページを作成します..."
    
    # フォールバック用シンプルページ
    cat > /srv/www/htdocs/aivis-chan-bot.com/index.html << 'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aivis-chan Bot | Discord音声合成ボット</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; color: white; max-width: 600px; padding: 2rem; }
        h1 { font-size: 3rem; margin-bottom: 1rem; }
        p { font-size: 1.2rem; margin-bottom: 2rem; line-height: 1.6; }
        .btn { display: inline-block; padding: 12px 24px; margin: 0 10px; background: rgba(255,255,255,0.2); color: white; text-decoration: none; border-radius: 25px; border: 2px solid rgba(255,255,255,0.3); transition: all 0.3s; }
        .btn:hover { background: rgba(255,255,255,0.3); transform: translateY(-2px); }
        .btn.primary { background: #5865F2; border-color: #5865F2; }
        .btn.primary:hover { background: #4752C4; }
        .btn.patreon { background: #FF424D; border-color: #FF424D; }
        .btn.patreon:hover { background: #E63946; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Aivis-chan Bot</h1>
        <p>高品質なDiscord音声合成ボット<br>AivisSpeech Engine搭載で自然な音声を実現</p>
        <div style="margin-bottom: 2rem;">
            <a href="https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=3148800&scope=bot%20applications.commands" class="btn primary" target="_blank">Botを追加</a>
            <a href="https://status.aivis-chan-bot.com" class="btn">ステータス確認</a>
        </div>
        <div style="margin-bottom: 1rem;">
            <a href="https://www.patreon.com/aivis_chan_bot" class="btn patreon" target="_blank">❤️ Patreonで支援</a>
            <a href="https://discord.gg/MPx2ny8HXT" class="btn" target="_blank">サポートサーバー</a>
        </div>
        <p style="font-size: 0.9rem; opacity: 0.8;">Pro・Premiumプランで更なる機能をご利用いただけます</p>
    </div>
</body>
</html>
EOF
fi

# ステータスページファイル配置
if [ -d "/home/$(logname)/Aivis-chan-bot-web" ]; then
    cp -r /home/$(logname)/Aivis-chan-bot-web/* /srv/www/htdocs/status/
elif [ -d "/tmp/Aivis-chan-bot-web" ]; then
    cp -r /tmp/Aivis-chan-bot-web/* /srv/www/htdocs/status/
else
    echo "⚠️  ステータスページファイルが見つかりません"
    echo "手動でファイルを配置してください: /srv/www/htdocs/status/"
fi

# 権限設定
chown -R wwwrun:www /srv/www/htdocs/
chmod -R 644 /srv/www/htdocs/
find /srv/www/htdocs/ -type d -exec chmod 755 {} \;

# サイト有効化
a2ensite aivis-chan-bot.com >/dev/null 2>&1
a2ensite status.aivis-chan-bot.com >/dev/null 2>&1
systemctl reload apache2

# SSL証明書取得
echo "🔒 SSL証明書取得中..."
certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 60 \
    --non-interactive \
    --agree-tos \
    --email admin@aivis-chan-bot.com \
    --domains "aivis-chan-bot.com,*.aivis-chan-bot.com"

if [ $? -eq 0 ]; then
    # SSL サイト有効化
    a2ensite aivis-chan-bot.com-ssl >/dev/null 2>&1
    a2ensite status.aivis-chan-bot.com-ssl >/dev/null 2>&1
    systemctl reload apache2
    
    # 自動更新設定
    if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload apache2") | crontab -
    fi
    
    echo
    echo "✅ セットアップ完了！"
    echo
    echo "🌐 メインサイト: https://aivis-chan-bot.com"
    echo "📊 ステータスページ: https://status.aivis-chan-bot.com"
    echo
    echo "📝 次のステップ:"
    echo "1. Cloudflareで SSL/TLS を 'Full (strict)' に設定"
    echo "2. DNS設定でプロキシ（🟠 Proxied）を有効化"
    echo "3. Cloudflareの最適化機能を設定"
    echo
    echo "🧪 接続テスト実行中..."
    sleep 5
    
    if curl -s --max-time 10 "https://aivis-chan-bot.com" >/dev/null 2>&1; then
        echo "✅ メインサイト接続成功"
    else
        echo "⚠️  メインサイト接続テスト失敗（DNS伝播待ちの可能性）"
    fi
    
    if curl -s --max-time 10 "https://status.aivis-chan-bot.com" >/dev/null 2>&1; then
        echo "✅ ステータスページ接続成功"
    else
        echo "⚠️  ステータスページ接続テスト失敗（DNS伝播待ちの可能性）"
    fi
    
else
    echo "❌ SSL証明書取得に失敗しました"
    echo "API Tokenの権限とドメイン設定を確認してください"
    exit 1
fi

echo
echo "🎉 Cloudflare + aivis-chan-bot.com セットアップ完了！"
