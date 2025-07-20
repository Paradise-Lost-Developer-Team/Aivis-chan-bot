#!/bin/bash
# ポート競合解決スクリプト
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

# 権限チェック
if [ "$EUID" -ne 0 ]; then
    error "このスクリプトはroot権限で実行してください"
    exit 1
fi

echo "=================================="
echo "ポート80競合解決スクリプト"
echo "=================================="

# 1. ポート80を使用しているプロセスを確認
log "ポート80を使用しているプロセスを確認中..."
echo ""
echo "=== ポート80の使用状況 ==="
lsof -i :80 || echo "ポート80を使用しているプロセスが見つかりません"
echo ""

netstat -tlnp | grep ":80 " || echo "netstatでもポート80の使用が確認できません"
echo ""

# 2. ss コマンドでも確認
log "ss コマンドでポート確認..."
ss -tlnp | grep ":80 " || echo "ssでもポート80の使用が確認できません"
echo ""

# 3. よくある競合サービスをチェック
log "よくある競合サービスをチェック中..."

services_to_check=("nginx" "lighttpd" "caddy" "httpd" "apache2")

for service in "${services_to_check[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        warn "$service が実行中です"
        systemctl status "$service" --no-pager -l
        echo ""
    fi
done

# 4. Docker コンテナの確認
log "Dockerコンテナでポート80を使用していないか確認..."
if command -v docker &> /dev/null; then
    docker ps --format "table {{.Names}}\t{{.Ports}}" | grep ":80" || echo "Dockerコンテナによるポート80の使用は確認されません"
else
    echo "Dockerはインストールされていません"
fi
echo ""

# 解決オプション
echo "=================================="
echo "解決オプション:"
echo "=================================="
echo "1) 競合サービスを停止してApacheを起動"
echo "2) Apacheを別ポート（8080）で起動"
echo "3) 競合サービスを完全に無効化"
echo "4) 手動で確認・解決"
echo ""

read -p "選択してください (1-4): " choice

case $choice in
    1)
        log "競合サービスを停止中..."
        
        # 一般的なWebサーバーを停止
        for service in nginx lighttpd caddy httpd; do
            if systemctl is-active --quiet "$service" 2>/dev/null; then
                warn "$service を停止中..."
                systemctl stop "$service"
            fi
        done
        
        # Dockerコンテナでポート80を使用しているものを停止
        if command -v docker &> /dev/null; then
            docker ps -q --filter "publish=80" | xargs -r docker stop
        fi
        
        log "Apache2を起動中..."
        systemctl start apache2
        
        if systemctl is-active --quiet apache2; then
            success "Apache2が正常に起動しました"
        else
            error "Apache2の起動に失敗しました"
        fi
        ;;
        
    2)
        log "Apacheを8080ポートで設定中..."
        
        # ports.confを8080に変更
        cat > /etc/apache2/ports.conf << 'EOF'
Listen 8080

<IfModule mod_ssl.c>
    Listen 443
</IfModule>
EOF

        # default-server.confも8080に変更
        sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8080>/g' /etc/apache2/default-server.conf
        
        # 仮想ホスト設定があれば変更
        if [ -f "/etc/apache2/vhosts.d/aivis-status.conf" ]; then
            sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8080>/g' /etc/apache2/vhosts.d/aivis-status.conf
        fi
        
        systemctl start apache2
        
        if systemctl is-active --quiet apache2; then
            success "Apache2が8080ポートで起動しました"
            echo "アクセスURL: http://$(hostname -I | awk '{print $1}'):8080/"
        else
            error "Apache2の起動に失敗しました"
        fi
        ;;
        
    3)
        log "競合サービスを無効化中..."
        
        for service in nginx lighttpd caddy httpd; do
            if systemctl is-enabled --quiet "$service" 2>/dev/null; then
                warn "$service を無効化中..."
                systemctl stop "$service"
                systemctl disable "$service"
            fi
        done
        
        systemctl start apache2
        
        if systemctl is-active --quiet apache2; then
            success "Apache2が正常に起動しました"
        else
            error "Apache2の起動に失敗しました"
        fi
        ;;
        
    4)
        log "手動確認のための情報:"
        echo ""
        echo "手動確認コマンド:"
        echo "1. ポート使用確認: sudo lsof -i :80"
        echo "2. サービス確認: sudo systemctl list-units --type=service --state=active | grep -E 'nginx|apache|httpd'"
        echo "3. プロセス強制終了: sudo kill -9 <PID>"
        echo "4. Apache起動: sudo systemctl start apache2"
        echo ""
        echo "よくある競合サービス:"
        echo "- nginx: sudo systemctl stop nginx"
        echo "- lighttpd: sudo systemctl stop lighttpd"
        echo "- Docker: docker ps | grep :80"
        ;;
        
    *)
        error "無効な選択です"
        exit 1
        ;;
esac

echo ""
log "処理完了"
