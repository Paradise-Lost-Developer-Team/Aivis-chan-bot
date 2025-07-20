#!/bin/bash
# Aivis-chan Bot ステータスページ バックアップスクリプト
# openSUSE Leap用

set -e

# 設定変数
PROJECT_NAME="aivis-status"
WEB_ROOT="/var/www/html"
PROJECT_DIR="$WEB_ROOT/$PROJECT_NAME"
BACKUP_ROOT="/var/backups"
BACKUP_DIR="$BACKUP_ROOT/aivis-status"
LOG_FILE="/var/log/backup-aivis-status.log"
RETENTION_DAYS=30

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

# バックアップディレクトリの作成
create_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"
}

# ファイルバックアップ
backup_files() {
    log "ファイルバックアップを開始..."
    
    if [ ! -d "$PROJECT_DIR" ]; then
        error_exit "プロジェクトディレクトリが見つかりません: $PROJECT_DIR"
    fi
    
    BACKUP_NAME="files-$(date +%Y%m%d-%H%M%S)"
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
    
    tar -czf "$BACKUP_FILE" -C "$WEB_ROOT" "$PROJECT_NAME"
    
    if [ $? -eq 0 ]; then
        log "ファイルバックアップ完了: $BACKUP_FILE"
        log "バックアップサイズ: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        error_exit "ファイルバックアップに失敗しました"
    fi
}

# 設定ファイルのバックアップ
backup_config() {
    log "設定ファイルのバックアップを開始..."
    
    CONFIG_BACKUP_NAME="config-$(date +%Y%m%d-%H%M%S)"
    CONFIG_BACKUP_FILE="$BACKUP_DIR/$CONFIG_BACKUP_NAME.tar.gz"
    
    # Apache設定ファイル
    if [ -f "/etc/apache2/vhosts.d/aivis-status.conf" ]; then
        tar -czf "$CONFIG_BACKUP_FILE" \
            /etc/apache2/vhosts.d/aivis-status.conf \
            /etc/apache2/httpd.conf 2>/dev/null || true
        log "Apache設定ファイルをバックアップしました"
    fi
    
    # Nginx設定ファイル
    if [ -f "/etc/nginx/sites-available/aivis-status" ]; then
        tar -czf "$CONFIG_BACKUP_FILE" \
            /etc/nginx/sites-available/aivis-status \
            /etc/nginx/nginx.conf 2>/dev/null || true
        log "Nginx設定ファイルをバックアップしました"
    fi
}

# SSL証明書のバックアップ
backup_ssl() {
    log "SSL証明書のバックアップを開始..."
    
    SSL_DIR="/etc/letsencrypt"
    if [ -d "$SSL_DIR" ]; then
        SSL_BACKUP_NAME="ssl-$(date +%Y%m%d-%H%M%S)"
        SSL_BACKUP_FILE="$BACKUP_DIR/$SSL_BACKUP_NAME.tar.gz"
        
        tar -czf "$SSL_BACKUP_FILE" -C "/etc" "letsencrypt" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            log "SSL証明書バックアップ完了: $SSL_BACKUP_FILE"
        else
            log "WARNING: SSL証明書のバックアップに失敗しました"
        fi
    else
        log "SSL証明書ディレクトリが見つかりません"
    fi
}

# 古いバックアップの削除
cleanup_old_backups() {
    log "古いバックアップを削除中..."
    
    # ファイルバックアップ
    find "$BACKUP_DIR" -name "files-*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
    FILES_DELETED=$(find "$BACKUP_DIR" -name "files-*.tar.gz" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
    
    # 設定ファイルバックアップ
    find "$BACKUP_DIR" -name "config-*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
    CONFIG_DELETED=$(find "$BACKUP_DIR" -name "config-*.tar.gz" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
    
    # SSL証明書バックアップ
    find "$BACKUP_DIR" -name "ssl-*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
    SSL_DELETED=$(find "$BACKUP_DIR" -name "ssl-*.tar.gz" -mtime +$RETENTION_DAYS 2>/dev/null | wc -l)
    
    log "古いバックアップを削除しました (${RETENTION_DAYS}日以上古い)"
    log "削除されたファイル: ファイル=$FILES_DELETED, 設定=$CONFIG_DELETED, SSL=$SSL_DELETED"
}

# バックアップ統計
show_backup_stats() {
    log "=== バックアップ統計 ==="
    
    TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "*.tar.gz" 2>/dev/null | wc -l)
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
    
    log "総バックアップ数: $TOTAL_BACKUPS"
    log "総使用容量: $TOTAL_SIZE"
    
    # 最新のバックアップ
    LATEST_BACKUP=$(find "$BACKUP_DIR" -name "files-*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [ -n "$LATEST_BACKUP" ]; then
        LATEST_DATE=$(stat -c %y "$LATEST_BACKUP" 2>/dev/null | cut -d' ' -f1,2)
        log "最新バックアップ: $(basename "$LATEST_BACKUP") ($LATEST_DATE)"
    fi
}

# システム情報の記録
record_system_info() {
    SYSTEM_INFO_FILE="$BACKUP_DIR/system-info-$(date +%Y%m%d).txt"
    
    {
        echo "=== システム情報 ==="
        echo "日時: $(date)"
        echo "ホスト名: $(hostname)"
        echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        echo "カーネル: $(uname -r)"
        echo ""
        echo "=== ディスク使用量 ==="
        df -h "$WEB_ROOT"
        echo ""
        echo "=== Webサーバー状態 ==="
        systemctl is-active apache2 2>/dev/null && echo "Apache: 動作中" || echo "Apache: 停止中"
        systemctl is-active nginx 2>/dev/null && echo "Nginx: 動作中" || echo "Nginx: 停止中"
        echo ""
        echo "=== プロジェクト情報 ==="
        if [ -d "$PROJECT_DIR" ]; then
            echo "プロジェクトサイズ: $(du -sh "$PROJECT_DIR" | cut -f1)"
            echo "ファイル数: $(find "$PROJECT_DIR" -type f | wc -l)"
        fi
    } > "$SYSTEM_INFO_FILE"
    
    log "システム情報を記録: $SYSTEM_INFO_FILE"
}

# メイン処理
main() {
    log "=== Aivis-chan Bot ステータスページ バックアップ開始 ==="
    
    check_permissions
    create_backup_dir
    backup_files
    backup_config
    backup_ssl
    record_system_info
    cleanup_old_backups
    show_backup_stats
    
    log "=== バックアップ完了 ==="
}

# ヘルプ表示
show_help() {
    echo "Aivis-chan Bot ステータスページ バックアップスクリプト"
    echo ""
    echo "使用方法:"
    echo "  $0                 - 通常のバックアップを実行"
    echo "  $0 --help         - このヘルプを表示"
    echo "  $0 --restore FILE - バックアップファイルから復元"
    echo "  $0 --list         - バックアップファイル一覧を表示"
    echo ""
    echo "設定:"
    echo "  保持期間: ${RETENTION_DAYS}日"
    echo "  バックアップ先: $BACKUP_DIR"
}

# バックアップ一覧表示
list_backups() {
    echo "=== バックアップファイル一覧 ==="
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf '%T@ %TY-%Tm-%Td %TH:%TM:%TS %s %p\n' 2>/dev/null | \
    sort -rn | \
    awk '{
        size = $4;
        if (size >= 1024*1024*1024) {
            size_str = sprintf("%.1fGB", size/(1024*1024*1024));
        } else if (size >= 1024*1024) {
            size_str = sprintf("%.1fMB", size/(1024*1024));
        } else if (size >= 1024) {
            size_str = sprintf("%.1fKB", size/1024);
        } else {
            size_str = size "B";
        }
        printf "%-20s %-8s %s\n", $2" "$3, size_str, $5;
    }'
}

# 復元処理
restore_backup() {
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        error_exit "バックアップファイルが見つかりません: $BACKUP_FILE"
    fi
    
    log "バックアップから復元中: $BACKUP_FILE"
    
    # 現在のファイルをバックアップ
    create_backup_dir
    CURRENT_BACKUP="$BACKUP_DIR/before-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
    if [ -d "$PROJECT_DIR" ]; then
        tar -czf "$CURRENT_BACKUP" -C "$WEB_ROOT" "$PROJECT_NAME"
        log "現在のファイルをバックアップ: $CURRENT_BACKUP"
    fi
    
    # 復元実行
    rm -rf "$PROJECT_DIR"
    tar -xzf "$BACKUP_FILE" -C "$WEB_ROOT"
    
    # 権限設定
    chown -R wwwrun:www "$PROJECT_DIR"
    find "$PROJECT_DIR" -type d -exec chmod 755 {} \;
    find "$PROJECT_DIR" -type f -exec chmod 644 {} \;
    
    log "復元完了"
}

# コマンドライン引数の処理
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --list|-l)
        list_backups
        exit 0
        ;;
    --restore|-r)
        if [ -z "${2:-}" ]; then
            echo "エラー: 復元するバックアップファイルを指定してください"
            echo "使用方法: $0 --restore /path/to/backup.tar.gz"
            exit 1
        fi
        restore_backup "$2"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        echo "エラー: 不明なオプション: $1"
        show_help
        exit 1
        ;;
esac
