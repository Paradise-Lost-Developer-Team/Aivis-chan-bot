#!/bin/bash
# Apache 診断・修復スクリプト
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

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "=================================="
echo "Apache 診断・修復スクリプト"
echo "=================================="

# 権限チェック
if [ "$EUID" -ne 0 ]; then
    error "このスクリプトはroot権限で実行してください"
    exit 1
fi

# 1. Apache設定テスト
log "Apache設定をテスト中..."
apache2ctl configtest 2>&1 | tee /tmp/apache_configtest.log

if apache2ctl configtest 2>/dev/null; then
    success "Apache設定は正常です"
else
    error "Apache設定にエラーがあります"
    echo "エラー詳細:"
    cat /tmp/apache_configtest.log
fi

echo ""

# 2. Apache詳細ステータス確認
log "Apache詳細ステータスを確認中..."
systemctl status apache2.service --no-pager -l

echo ""

# 3. Apache ログ確認
log "Apacheエラーログを確認中..."
if [ -f "/var/log/apache2/error_log" ]; then
    echo "最新のエラーログ（最後の20行）:"
    tail -20 /var/log/apache2/error_log
else
    warn "エラーログファイルが見つかりません"
fi

echo ""

# 4. 仮想ホスト設定確認
log "仮想ホスト設定を確認中..."
if [ -f "/etc/apache2/vhosts.d/aivis-status.conf" ]; then
    echo "aivis-status.conf の内容:"
    cat /etc/apache2/vhosts.d/aivis-status.conf
else
    warn "仮想ホスト設定ファイルが見つかりません"
fi

echo ""

# 5. ポート使用状況確認
log "ポート使用状況を確認中..."
netstat -tlnp | grep ":80\|:443"

echo ""

# 6. Apache有効モジュール確認
log "Apache有効モジュールを確認中..."
apache2ctl -M 2>/dev/null | head -10

echo ""

# 修復オプション
echo "=================================="
echo "修復オプション:"
echo "=================================="
echo "1) Apache設定を初期化"
echo "2) 仮想ホスト設定を削除"
echo "3) Apacheを再インストール"
echo "4) ポート競合を解決"
echo "5) 手動修復（推奨）"
echo ""

read -p "選択してください (1-5): " choice

case $choice in
    1)
        log "Apache設定を初期化中..."
        cp /etc/apache2/default-server.conf /etc/apache2/default-server.conf.backup
        # デフォルト設定に戻す
        echo "Listen 80" > /etc/apache2/ports.conf
        systemctl restart apache2
        ;;
    2)
        log "仮想ホスト設定を削除中..."
        rm -f /etc/apache2/vhosts.d/aivis-status.conf
        systemctl restart apache2
        ;;
    3)
        log "Apacheを再インストール中..."
        systemctl stop apache2 || true
        zypper remove -y apache2
        zypper install -y --auto-agree-with-licenses apache2
        systemctl enable apache2
        systemctl start apache2
        ;;
    4)
        log "ポート競合を確認中..."
        lsof -i :80 || echo "ポート80は使用されていません"
        ;;
    5)
        log "手動修復のための情報:"
        echo ""
        echo "手動修復手順:"
        echo "1. sudo systemctl stop apache2"
        echo "2. sudo apache2ctl configtest"
        echo "3. エラー箇所を修正"
        echo "4. sudo systemctl start apache2"
        echo ""
        echo "よくある問題:"
        echo "- ServerName設定の問題"
        echo "- 仮想ホスト設定の構文エラー"
        echo "- ポート競合（80番ポート）"
        echo "- SSL証明書の問題"
        ;;
    *)
        error "無効な選択です"
        exit 1
        ;;
esac

echo ""
log "診断・修復完了"
