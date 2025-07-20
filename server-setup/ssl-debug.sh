#!/bin/bash

# SSL設定トラブルシューティングスクリプト
# aivis-chan-bot.com用

DOMAIN="aivis-chan-bot.com"
SUBDOMAIN="status"

echo "🔍 SSL設定診断スクリプト - $DOMAIN"
echo "=================================="

# Apache状態確認
echo "1. Apache状態確認:"
if systemctl is-active --quiet apache2; then
    echo "✅ Apache起動中"
else
    echo "❌ Apache停止中"
    systemctl status apache2
fi

# ポート確認
echo -e "\n2. ポート確認:"

# ポート確認コマンドの選択（openSUSE対応）
if command -v netstat >/dev/null; then
    PORT_CMD="netstat -tlnp"
elif command -v ss >/dev/null; then
    PORT_CMD="ss -tlnp"
else
    echo "❌ ポート確認コマンド（netstat/ss）が見つかりません"
    PORT_CMD=""
fi

if [ -n "$PORT_CMD" ]; then
    echo "ポート80:"
    $PORT_CMD | grep ":80" || echo "ポート80で待機中のプロセスはありません"
    echo "ポート443:"
    $PORT_CMD | grep ":443" || echo "ポート443で待機中のプロセスはありません"
else
    echo "ポート確認をスキップします"
fi

# SSL証明書ファイル確認
echo -e "\n3. SSL証明書ファイル確認:"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "✅ 証明書ディレクトリ存在"
    ls -la /etc/letsencrypt/live/$DOMAIN/
    
    echo -e "\n証明書有効期限:"
    openssl x509 -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem -noout -dates
else
    echo "❌ 証明書ディレクトリが見つかりません"
fi

# Apache設定ファイル確認
echo -e "\n4. Apache設定ファイル確認:"
echo "メインドメイン SSL設定:"
if [ -f "/etc/apache2/sites-available/$DOMAIN-ssl.conf" ]; then
    echo "✅ $DOMAIN-ssl.conf 存在"
else
    echo "❌ $DOMAIN-ssl.conf が見つかりません"
fi

echo "ステータスページ SSL設定:"
if [ -f "/etc/apache2/sites-available/$SUBDOMAIN.$DOMAIN-ssl.conf" ]; then
    echo "✅ $SUBDOMAIN.$DOMAIN-ssl.conf 存在"
else
    echo "❌ $SUBDOMAIN.$DOMAIN-ssl.conf が見つかりません"
fi

# Apache設定テスト
echo -e "\n5. Apache設定テスト:"
if apache2ctl configtest 2>/dev/null; then
    echo "✅ Apache設定OK"
else
    echo "❌ Apache設定エラー"
    apache2ctl configtest
fi

# Include設定確認
echo -e "\n6. Include設定確認:"
echo "httpd.conf での Include:"
grep -n "Include.*$DOMAIN" /etc/apache2/httpd.conf 2>/dev/null || echo "httpd.confにIncludeなし"

echo "default-server.conf での Include:"
grep -n "Include.*$DOMAIN" /etc/apache2/default-server.conf 2>/dev/null || echo "default-server.confにIncludeなし"

# SSLモジュール確認
echo -e "\n7. SSLモジュール確認:"
if apache2ctl -M 2>/dev/null | grep -q ssl; then
    echo "✅ SSLモジュール有効"
else
    echo "❌ SSLモジュール無効"
fi

# Listen設定確認
echo -e "\n8. Listen設定確認:"
grep -n "Listen 443" /etc/apache2/listen.conf 2>/dev/null || echo "listen.confにListen 443なし"
grep -n "Listen 443" /etc/apache2/httpd.conf 2>/dev/null || echo "httpd.confにListen 443なし"

# ファイアウォール確認
echo -e "\n9. ファイアウォール確認:"
if systemctl is-active --quiet firewalld; then
    echo "firewalld設定:"
    firewall-cmd --list-services
    firewall-cmd --list-ports
elif command -v ufw >/dev/null; then
    echo "ufw設定:"
    ufw status
else
    echo "ファイアウォール未検出"
fi

# 接続テスト
echo -e "\n10. 接続テスト:"
echo "ローカルHTTPS接続:"
if curl -k -s --max-time 5 "https://localhost" >/dev/null 2>&1; then
    echo "✅ ローカルHTTPS接続成功"
else
    echo "❌ ローカルHTTPS接続失敗"
fi

echo "外部HTTPS接続:"
if curl -s --max-time 5 "https://$DOMAIN" >/dev/null 2>&1; then
    echo "✅ 外部HTTPS接続成功"
else
    echo "❌ 外部HTTPS接続失敗"
fi

echo -e "\n11. 推奨修正手順:"
echo "問題が見つかった場合の修正手順:"
echo "1. Apache再起動: sudo systemctl restart apache2"
echo "2. 設定再読み込み: sudo systemctl reload apache2"
echo "3. ファイアウォール確認: sudo firewall-cmd --list-all"
echo "4. 証明書更新: sudo certbot renew --force-renewal"
echo "5. 手動設定確認: sudo nano /etc/apache2/httpd.conf"

echo -e "\n診断完了！"
