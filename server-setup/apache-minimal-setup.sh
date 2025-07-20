#!/bin/bash
# Apache 最小設定セットアップ
# 作成日: 2025/07/21

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
echo "Apache 最小設定セットアップ"
echo "=================================="

# Apacheを停止
log "Apacheを停止中..."
systemctl stop apache2 || true

# 仮想ホスト設定を削除
log "既存の仮想ホスト設定を削除中..."
rm -f /etc/apache2/vhosts.d/aivis-status.conf

# 最小限のports.conf設定
log "ports.conf を設定中..."
cat > /etc/apache2/ports.conf << 'EOF'
Listen 80

<IfModule mod_ssl.c>
    Listen 443
</IfModule>

<IfModule mod_gnutls.c>
    Listen 443
</IfModule>
EOF

# デフォルトのドキュメントルート設定
log "デフォルト設定を確認中..."
if [ ! -f "/etc/apache2/default-server.conf.backup" ]; then
    cp /etc/apache2/default-server.conf /etc/apache2/default-server.conf.backup
fi

# 最小限のdefault-server.conf
cat > /etc/apache2/default-server.conf << 'EOF'
ServerName localhost
DocumentRoot "/srv/www/htdocs"

<Directory "/srv/www/htdocs">
    Options Indexes FollowSymLinks
    AllowOverride None
    Require all granted
</Directory>

DirectoryIndex index.html

ErrorLog /var/log/apache2/error_log
TransferLog /var/log/apache2/access_log

<IfModule mod_rewrite.c>
    RewriteEngine on
</IfModule>

<IfModule mod_headers.c>
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type"
</IfModule>
EOF

# Webディレクトリの作成と権限設定
log "Webディレクトリを設定中..."
mkdir -p /srv/www/htdocs
chown -R wwwrun:www /srv/www/htdocs
chmod -R 755 /srv/www/htdocs

# テスト用index.htmlを作成
if [ ! -f "/srv/www/htdocs/index.html" ]; then
    log "テスト用index.htmlを作成中..."
    cat > /srv/www/htdocs/index.html << 'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Apache テストページ</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        .container { max-width: 600px; margin: 0 auto; }
        .status { color: #2ecc71; font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 Apache正常動作中</h1>
        <p class="status">Webサーバーのセットアップが完了しました</p>
        <p>次のステップ: Aivis-chan Botステータスページファイルを配置</p>
        <hr>
        <p><small>テスト日時: <span id="datetime"></span></small></p>
    </div>
    <script>
        document.getElementById('datetime').textContent = new Date().toLocaleString('ja-JP');
    </script>
</body>
</html>
EOF
    chmod 644 /srv/www/htdocs/index.html
fi

# Apache設定テスト
log "Apache設定をテスト中..."
if apache2ctl configtest; then
    success "Apache設定は正常です"
else
    error "Apache設定にエラーがあります"
    apache2ctl configtest
    exit 1
fi

# Apache起動
log "Apacheを起動中..."
systemctl start apache2

# サービス状況確認
if systemctl is-active --quiet apache2; then
    success "Apache が正常に起動しました"
    
    echo ""
    echo "==============================="
    echo "セットアップ完了！"
    echo "==============================="
    echo "テストアクセス:"
    echo "- ローカル: http://localhost/"
    echo "- 外部: http://$(hostname -I | awk '{print $1}')/"
    echo ""
    echo "次のステップ:"
    echo "1. ブラウザでアクセステスト"
    echo "2. Aivis-chan Botステータスページファイルを配置"
    echo "   sudo cp -r ~/Aivis-chan-bot-web/* /srv/www/htdocs/"
    echo "==============================="
else
    error "Apacheの起動に失敗しました"
    systemctl status apache2 --no-pager -l
    exit 1
fi
