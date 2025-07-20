#!/bin/bash
# Aivis-chan Bot ステータスページ 自動デプロイスクリプト
# openSUSE Leap用

set -e

# 設定変数
PROJECT_NAME="aivis-status"
WEB_ROOT="/var/www/html"
PROJECT_DIR="$WEB_ROOT/$PROJECT_NAME"
SOURCE_DIR="/home/$(whoami)/aivis-chan-bot-web"
BACKUP_DIR="/var/backups/aivis-status"
WEB_USER="wwwrun"
WEB_GROUP="www"
LOG_FILE="/var/log/deploy-aivis-status.log"

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# エラーハンドリング
error_exit() {
    log "ERROR: $1"
    exit 1
}

# 権限チェック
check_permissions() {
    if [ "$EUID" -ne 0 ]; then
        error_exit "このスクリプトはroot権限で実行してください"
    fi
}

# バックアップ作成
create_backup() {
    log "バックアップを作成中..."
    
    if [ -d "$PROJECT_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
        tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C "$WEB_ROOT" "$PROJECT_NAME"
        log "バックアップ作成完了: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
        
        # 古いバックアップを削除（7日以上古いもの）
        find "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +7 -delete
    fi
}

# ファイルのデプロイ
deploy_files() {
    log "ファイルをデプロイ中..."
    
    # プロジェクトディレクトリの作成
    mkdir -p "$PROJECT_DIR"
    
    # ソースファイルの存在確認
    if [ ! -d "$SOURCE_DIR" ]; then
        error_exit "ソースディレクトリが見つかりません: $SOURCE_DIR"
    fi
    
    # ファイルのコピー
    cp -r "$SOURCE_DIR"/* "$PROJECT_DIR/"
    
    # 不要なファイルを削除
    rm -rf "$PROJECT_DIR/server-setup"
    rm -f "$PROJECT_DIR/README.md"
    rm -f "$PROJECT_DIR/.git*"
    
    log "ファイルのデプロイ完了"
}

# 権限設定
set_permissions() {
    log "権限を設定中..."
    
    # 所有者とグループを設定
    chown -R "$WEB_USER:$WEB_GROUP" "$PROJECT_DIR"
    
    # 権限を設定
    find "$PROJECT_DIR" -type d -exec chmod 755 {} \;
    find "$PROJECT_DIR" -type f -exec chmod 644 {} \;
    
    log "権限設定完了"
}

# Apache設定の確認と再読み込み
restart_apache() {
    log "Apacheの設定を確認中..."
    
    # 設定ファイルのテスト
    if apache2ctl configtest; then
        log "Apache設定ファイルが正常です"
        systemctl reload apache2
        log "Apache再読み込み完了"
    else
        error_exit "Apache設定ファイルにエラーがあります"
    fi
}

# Nginx設定の確認と再読み込み（Nginxを使用している場合）
restart_nginx() {
    log "Nginxの設定を確認中..."
    
    # 設定ファイルのテスト
    if nginx -t; then
        log "Nginx設定ファイルが正常です"
        systemctl reload nginx
        log "Nginx再読み込み完了"
    else
        error_exit "Nginx設定ファイルにエラーがあります"
    fi
}

# サービス確認
check_services() {
    log "サービス状況を確認中..."
    
    # ApacheまたはNginxの確認
    if systemctl is-active --quiet apache2; then
        log "Apache は正常に動作しています"
        restart_apache
    elif systemctl is-active --quiet nginx; then
        log "Nginx は正常に動作しています"
        restart_nginx
    else
        error_exit "WebサーバーがインストールまたはAnginが起動していません"
    fi
}

# SSL証明書の確認
check_ssl() {
    log "SSL証明書を確認中..."
    
    if command -v certbot &> /dev/null; then
        certbot certificates 2>/dev/null | grep -q "status.yourdomain.com" && \
        log "SSL証明書が設定されています" || \
        log "WARNING: SSL証明書が設定されていません"
    else
        log "WARNING: certbotがインストールされていません"
    fi
}

# 動作確認
health_check() {
    log "動作確認中..."
    
    # ローカルでのアクセス確認
    if curl -s -o /dev/null -w "%{http_code}" http://localhost/aivis-status/ | grep -q "200"; then
        log "ローカルアクセス確認: OK"
    else
        log "WARNING: ローカルアクセスが失敗しました"
    fi
}

# メイン処理
main() {
    log "=== Aivis-chan Bot ステータスページ デプロイ開始 ==="
    
    check_permissions
    create_backup
    deploy_files
    set_permissions
    check_services
    check_ssl
    health_check
    
    log "=== デプロイ完了 ==="
    log "ブラウザで http://localhost/aivis-status/ にアクセスして確認してください"
}

# スクリプト実行
main "$@"
