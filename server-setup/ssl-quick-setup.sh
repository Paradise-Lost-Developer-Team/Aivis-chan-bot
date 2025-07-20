#!/bin/bash

# 簡易SSL証明書取得スクリプト
# openSUSE Leap 15.6 + Apache2用

set -e

DOMAIN="alecjp02.asuscomm.com"
EMAIL="admin@alecjp02.asuscomm.com"

echo "🔒 SSL証明書取得スクリプト"
echo "ドメイン: $DOMAIN"
echo

# rootユーザーチェック
if [ "$EUID" -ne 0 ]; then
    echo "❌ エラー: root権限で実行してください"
    echo "実行方法: sudo ./ssl-quick-setup.sh"
    exit 1
fi

echo "📦 必要なパッケージをインストール中..."
zypper refresh >/dev/null 2>&1
zypper install -y certbot python3-certbot-apache >/dev/null 2>&1

echo "🔥 ファイアウォール設定中..."
if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http >/dev/null 2>&1
    firewall-cmd --permanent --add-service=https >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1
fi

echo "🌐 Apache2設定確認中..."
if ! systemctl is-active --quiet apache2; then
    systemctl start apache2
    systemctl enable apache2
fi

echo "📋 既存証明書確認中..."
if certbot certificates 2>/dev/null | grep -q "$DOMAIN"; then
    echo "⚠️  既存の証明書が見つかりました"
    echo "証明書を更新します..."
    certbot renew --force-renewal --quiet
else
    echo "🆕 新しい証明書を取得します..."
    
    # Apache統合モードで証明書取得
    certbot --apache \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN" \
        --redirect \
        --quiet
fi

echo "⏰ 自動更新設定中..."
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload apache2") | crontab -
fi

echo "✅ SSL証明書設定完了！"
echo
echo "🔗 アクセスURL: https://$DOMAIN"
echo "📄 証明書パス: /etc/letsencrypt/live/$DOMAIN/"
echo "🔄 自動更新: 毎日午前3時"
echo
echo "🧪 接続テスト中..."
sleep 3

if curl -s --max-time 10 "https://$DOMAIN" >/dev/null 2>&1; then
    echo "✅ HTTPS接続成功"
else
    echo "⚠️  HTTPS接続テストに失敗 - 少し時間をおいて再試行してください"
fi

echo
echo "🎉 セットアップ完了！"
