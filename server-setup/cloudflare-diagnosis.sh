#!/bin/bash

# Cloudflare接続診断スクリプト
# aivis-chan-bot.com用

DOMAIN="aivis-chan-bot.com"
SUBDOMAIN="status"

echo "🔍 Cloudflare接続診断スクリプト"
echo "=============================="

# DNS確認
echo "1. DNS確認:"
echo "メインドメイン DNS確認:"
if command -v dig >/dev/null; then
    dig +short $DOMAIN A
    dig +short $DOMAIN AAAA 2>/dev/null || echo "IPv6レコードなし"
elif command -v nslookup >/dev/null; then
    nslookup $DOMAIN | grep -A1 "Name:"
fi

echo "ステータスページ DNS確認:"
if command -v dig >/dev/null; then
    dig +short $SUBDOMAIN.$DOMAIN A
elif command -v nslookup >/dev/null; then
    nslookup $SUBDOMAIN.$DOMAIN | grep -A1 "Name:"
fi

# サーバーのパブリックIP確認
echo -e "\n2. サーバーパブリックIP確認:"
curl -s ifconfig.me || curl -s ipinfo.io/ip || echo "パブリックIP取得失敗"

# ローカル接続テスト
echo -e "\n3. ローカル接続テスト:"
echo "HTTP localhost:"
curl -s -I http://localhost | head -1 || echo "HTTP接続失敗"

echo "HTTPS localhost:"
curl -k -s -I https://localhost | head -1 || echo "HTTPS接続失敗"

# 直接IP接続テスト
echo -e "\n4. 直接IP接続テスト:"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null)
if [ -n "$SERVER_IP" ]; then
    echo "HTTP $SERVER_IP:"
    curl -s -I http://$SERVER_IP | head -1 || echo "IP HTTP接続失敗"
    
    echo "HTTPS $SERVER_IP (証明書警告は正常):"
    curl -k -s -I https://$SERVER_IP | head -1 || echo "IP HTTPS接続失敗"
else
    echo "パブリックIP取得失敗のため、スキップ"
fi

# ポート開放確認
echo -e "\n5. ポート開放確認:"
if command -v ss >/dev/null; then
    echo "待機中ポート:"
    ss -tlnp | grep -E ":80|:443" || echo "HTTP/HTTPSポートで待機中のプロセスなし"
elif command -v netstat >/dev/null; then
    echo "待機中ポート:"
    netstat -tlnp | grep -E ":80|:443" || echo "HTTP/HTTPSポートで待機中のプロセスなし"
fi

# Apache状態確認
echo -e "\n6. Apache状態確認:"
if systemctl is-active --quiet apache2; then
    echo "✅ Apache起動中"
    echo "Apache VirtualHost確認:"
    apache2ctl -S 2>/dev/null | grep -E "443|80|aivis" || echo "VirtualHost情報なし"
else
    echo "❌ Apache停止中"
    systemctl status apache2 --no-pager
fi

# Cloudflare接続テスト
echo -e "\n7. Cloudflare接続テスト:"
echo "Cloudflare経由テスト（外部から）:"

# CloudflareのTrace機能を使用
echo "Cloudflare Trace ($DOMAIN):"
curl -s https://$DOMAIN/cdn-cgi/trace 2>/dev/null | head -5 || echo "Cloudflare Trace失敗（正常な場合もあります）"

# 外部DNS確認
echo -e "\n8. 外部DNS確認:"
echo "Google DNS (8.8.8.8) から確認:"
nslookup $DOMAIN 8.8.8.8 2>/dev/null | grep -A2 "Name:" || echo "外部DNS確認失敗"

# 推奨対処法
echo -e "\n📝 診断結果と推奨対処法:"
echo "==============================="

if curl -k -s -I https://localhost | grep -q "200"; then
    echo "✅ ローカルHTTPS接続: 正常"
    echo "問題はCloudflare設定またはファイアウォールの可能性があります"
    
    echo -e "\n推奨対処法:"
    echo "1. Cloudflareで以下を確認:"
    echo "   - SSL/TLS設定: 'Full (strict)' に設定"
    echo "   - プロキシ状態: オレンジ雲を無効にしてテスト"
    echo "   - DNS設定: サーバーの正しいIPアドレスが設定されているか"
    
    echo "2. ファイアウォール確認:"
    echo "   sudo firewall-cmd --list-all"
    echo "   sudo firewall-cmd --add-service=https --permanent"
    echo "   sudo firewall-cmd --reload"
    
    echo "3. 外部からのテスト:"
    echo "   別のサーバーまたはPCから https://$DOMAIN にアクセス"
    
else
    echo "❌ ローカルHTTPS接続: 失敗"
    echo "問題はApache SSL設定にあります"
    
    echo -e "\n推奨対処法:"
    echo "1. 緊急修復スクリプトを再実行:"
    echo "   sudo ./emergency-ssl-fix.sh"
    
    echo "2. Apache設定確認:"
    echo "   sudo apache2ctl configtest"
    echo "   sudo apache2ctl -S"
    
    echo "3. SSL証明書確認:"
    echo "   sudo ls -la /etc/letsencrypt/live/$DOMAIN/"
fi

echo -e "\n最終確認コマンド:"
echo "curl -k -I https://localhost"
echo "curl -I https://$DOMAIN"
