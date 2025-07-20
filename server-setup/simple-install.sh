#!/bin/bash
# Aivis-chan Bot ステータスページ - 静的サイト用セットアップ
# openSUSE Leap 15.6 用

set -e

# カラーコード
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 権限チェック
if [ "$EUID" -ne 0 ]; then
    error "このスクリプトはroot権限で実行してください"
    exit 1
fi

echo "=================================="
echo "Aivis-chan Bot ステータスページ"
echo "静的サイト用セットアップ"
echo "=================================="

# システム更新
log "システムを更新中..."
zypper refresh
zypper update -y --auto-agree-with-licenses

# Apache のインストール
log "Apache2をインストール中..."
zypper install -y --auto-agree-with-licenses apache2

# Apache設定
log "Apache設定中..."
a2enmod rewrite
a2enmod headers
a2enmod ssl

# Apache起動・有効化
systemctl enable apache2
systemctl start apache2

# ファイアウォール設定
log "ファイアウォール設定中..."
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

# Webファイルの配置
log "Webファイルを配置中..."
if [ -d "/home/alec/Aivis-chan-bot-web" ]; then
    # HTMLファイルをコピー
    cp /home/alec/Aivis-chan-bot-web/*.html /srv/www/htdocs/ 2>/dev/null || true
    
    # CSS、JS、画像フォルダをコピー
    cp -r /home/alec/Aivis-chan-bot-web/css /srv/www/htdocs/ 2>/dev/null || true
    cp -r /home/alec/Aivis-chan-bot-web/js /srv/www/htdocs/ 2>/dev/null || true
    cp -r /home/alec/Aivis-chan-bot-web/images /srv/www/htdocs/ 2>/dev/null || true
    
    # 権限設定
    chown -R wwwrun:www /srv/www/htdocs/
    chmod -R 644 /srv/www/htdocs/*
    find /srv/www/htdocs/ -type d -exec chmod 755 {} \;
    
    success "Webファイルの配置完了"
else
    error "Webファイルが見つかりません: /home/alec/Aivis-chan-bot-web"
    echo "以下の手順でファイルを手動で配置してください:"
    echo "1. scp -r c:\\Users\\uketp\\Aivis-chan-bot-web alec@mcserver:~/"
    echo "2. sudo cp -r ~/Aivis-chan-bot-web/* /srv/www/htdocs/"
    echo "3. sudo chown -R wwwrun:www /srv/www/htdocs/"
fi

# Apache設定ファイルの作成
log "Apache仮想ホスト設定を作成中..."
cat > /etc/apache2/vhosts.d/aivis-status.conf << 'EOF'
<VirtualHost *:80>
    DocumentRoot /srv/www/htdocs
    ServerName status.local
    
    <Directory /srv/www/htdocs>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    # CORSヘッダーの設定（APIアクセス用）
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type"
    
    ErrorLog /var/log/apache2/aivis-status_error.log
    CustomLog /var/log/apache2/aivis-status_access.log combined
</VirtualHost>
EOF

# Apache再起動
systemctl restart apache2

# セットアップ完了メッセージ
echo ""
success "セットアップ完了！"
echo ""
echo "==============================="
echo "アクセス情報:"
echo "==============================="
echo "ローカル: http://localhost/"
echo "外部: http://$(hostname -I | awk '{print $1}')/"
echo ""
echo "ログファイル:"
echo "- エラーログ: /var/log/apache2/aivis-status_error.log"
echo "- アクセスログ: /var/log/apache2/aivis-status_access.log"
echo ""
echo "Webファイルの場所: /srv/www/htdocs/"
echo ""
echo "サービス管理:"
echo "- Apache再起動: sudo systemctl restart apache2"
echo "- Apache停止: sudo systemctl stop apache2"
echo "- Apache開始: sudo systemctl start apache2"
echo "==============================="
