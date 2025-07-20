#!/bin/bash
# openSUSE Leap システム更新スクリプト
# ライセンス自動同意機能付き

set -e

# カラーコード
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 権限チェック
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "このスクリプトはroot権限で実行してください"
        exit 1
    fi
}

# システム更新前のバックアップ
create_system_backup() {
    log "システム更新前のバックアップを作成中..."
    
    # パッケージリストのバックアップ
    mkdir -p /var/backups/system-update
    
    # インストール済みパッケージリスト
    zypper search -i > "/var/backups/system-update/installed-packages-$(date +%Y%m%d-%H%M%S).txt"
    
    # リポジトリリスト
    zypper lr -d > "/var/backups/system-update/repositories-$(date +%Y%m%d-%H%M%S).txt"
    
    # システム情報
    {
        echo "=== System Information ==="
        uname -a
        echo ""
        echo "=== Disk Usage ==="
        df -h
        echo ""
        echo "=== Memory Usage ==="
        free -h
        echo ""
        echo "=== Kernel Version ==="
        cat /proc/version
    } > "/var/backups/system-update/system-info-$(date +%Y%m%d-%H%M%S).txt"
    
    success "システムバックアップ完了"
}

# システム更新の実行
perform_system_update() {
    log "システム更新を開始します..."
    
    # リポジトリの更新
    log "リポジトリを更新中..."
    zypper refresh
    
    # システム更新（ライセンス自動同意）
    log "パッケージを更新中..."
    zypper dist-upgrade -y --auto-agree-with-licenses --allow-vendor-change
    
    success "パッケージ更新完了"
}

# カーネル更新の確認
check_kernel_update() {
    log "カーネル更新を確認中..."
    
    # 現在のカーネルバージョン
    current_kernel=$(uname -r)
    
    # インストール済みカーネルパッケージ
    installed_kernels=$(zypper search -i -t package kernel-default | grep "kernel-default" | awk '{print $3}')
    
    log "現在のカーネル: $current_kernel"
    log "インストール済みカーネル:"
    echo "$installed_kernels"
    
    # 新しいカーネルがインストールされた場合
    if echo "$installed_kernels" | grep -v "$current_kernel" >/dev/null; then
        warn "新しいカーネルがインストールされました"
        warn "システムの再起動が必要です"
        return 1
    else
        log "カーネルの更新はありません"
        return 0
    fi
}

# Webサーバーサービスの確認
check_web_services() {
    log "Webサーバーサービスを確認中..."
    
    # Apache確認
    if systemctl is-active --quiet apache2; then
        log "Apache2: 動作中"
    else
        warn "Apache2: 停止中または未インストール"
    fi
    
    # Nginx確認
    if systemctl is-active --quiet nginx; then
        log "Nginx: 動作中"
    else
        warn "Nginx: 停止中または未インストール"
    fi
    
    # Aivis-chanステータスページの確認
    if [ -d "/var/www/html/aivis-status" ]; then
        log "Aivis-chanステータスページ: インストール済み"
        
        # HTTPアクセステスト
        if curl -s -o /dev/null -w "%{http_code}" http://localhost/aivis-status/ | grep -q "200"; then
            success "Aivis-chanステータスページ: アクセス可能"
        else
            warn "Aivis-chanステータスページ: アクセスエラー"
        fi
    else
        warn "Aivis-chanステータスページ: 未インストール"
    fi
}

# クリーンアップ処理
cleanup_system() {
    log "システムクリーンアップを実行中..."
    
    # 古いカーネルパッケージの削除（最新2つを保持）
    log "古いカーネルを削除中..."
    zypper purge-kernels --details
    
    # 不要なパッケージの削除
    log "不要なパッケージを削除中..."
    zypper packages --unneeded | awk 'NR>5 {print $5}' | while read package; do
        if [ -n "$package" ]; then
            zypper remove -y "$package" 2>/dev/null || true
        fi
    done
    
    # パッケージキャッシュのクリーンアップ
    log "パッケージキャッシュを削除中..."
    zypper clean --all
    
    success "システムクリーンアップ完了"
}

# 更新ログの記録
log_update_result() {
    local log_file="/var/log/system-update.log"
    
    {
        echo "=== System Update Log ==="
        echo "Date: $(date)"
        echo "User: $(whoami)"
        echo ""
        echo "=== Updated Packages ==="
        tail -100 /var/log/zypp/history | grep "$(date +%Y-%m-%d)"
        echo ""
        echo "=== Current System Info ==="
        uname -a
        echo ""
        echo "=== Disk Usage After Update ==="
        df -h
        echo ""
    } >> "$log_file"
    
    log "更新ログを記録しました: $log_file"
}

# 再起動が必要かチェック
check_reboot_required() {
    log "再起動要否を確認中..."
    
    local reboot_required=false
    
    # カーネル更新チェック
    if ! check_kernel_update; then
        reboot_required=true
    fi
    
    # zypper needs-restartingコマンドを使用
    if command -v zypper >/dev/null 2>&1; then
        if zypper needs-restarting -r >/dev/null 2>&1; then
            reboot_required=true
        fi
    fi
    
    # systemctl daemon-reexec要求チェック
    if [ -f /run/systemd/container ] || [ -f /var/run/reboot-required ]; then
        reboot_required=true
    fi
    
    if [ "$reboot_required" = true ]; then
        warn "システムの再起動が必要です"
        warn "以下のコマンドで再起動してください: sudo reboot"
        return 1
    else
        success "再起動は必要ありません"
        return 0
    fi
}

# 更新サマリーの表示
show_update_summary() {
    echo ""
    success "=== システム更新完了サマリー ==="
    echo ""
    log "更新日時: $(date)"
    log "更新前バックアップ: /var/backups/system-update/"
    log "更新ログ: /var/log/system-update.log"
    echo ""
    
    # システム情報
    log "現在のシステム情報:"
    echo "  OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
    echo "  カーネル: $(uname -r)"
    echo "  稼働時間: $(uptime -p)"
    echo ""
    
    # ディスク使用量
    log "ディスク使用量:"
    df -h / | tail -1 | awk '{print "  ルートパーティション: " $3 " / " $2 " (" $5 ")"}'
    echo ""
    
    # 次回のアクション
    log "推奨される次のアクション:"
    echo "  1. Webサービスの動作確認"
    echo "  2. Aivis-chanステータスページの確認"
    echo "  3. ログファイルの確認"
    
    if check_reboot_required; then
        echo "  4. ⚠️  システムの再起動 (必須)"
    fi
    
    echo ""
    success "システム更新プロセスが完了しました"
}

# 対話モードでの更新確認
interactive_update() {
    echo "=== openSUSE Leap システム更新 ==="
    echo ""
    
    # 現在の状況表示
    log "現在のシステム情報:"
    echo "  OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
    echo "  カーネル: $(uname -r)"
    echo "  最終更新: $(stat -c %y /var/cache/zypp/raw | cut -d. -f1)"
    echo ""
    
    # 利用可能な更新の確認
    log "利用可能な更新を確認中..."
    zypper list-updates
    
    echo ""
    read -p "システム更新を実行しますか？ [y/N]: " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        log "システム更新をキャンセルしました"
        exit 0
    fi
}

# 非対話モードでの更新
automatic_update() {
    log "自動更新モードで実行中..."
    
    # 利用可能な更新の確認
    updates_available=$(zypper list-updates | wc -l)
    if [ "$updates_available" -le 5 ]; then
        log "利用可能な更新がありません"
        exit 0
    fi
    
    log "$((updates_available - 5)) 個の更新が利用可能です"
}

# メイン処理
main() {
    local mode="${1:-interactive}"
    
    check_root
    
    case "$mode" in
        "auto"|"automatic")
            automatic_update
            ;;
        "interactive"|"")
            interactive_update
            ;;
        *)
            error "不明なモード: $mode"
            exit 1
            ;;
    esac
    
    create_system_backup
    perform_system_update
    check_web_services
    cleanup_system
    log_update_result
    check_reboot_required
    show_update_summary
}

# ヘルプ表示
show_help() {
    echo "openSUSE Leap システム更新スクリプト"
    echo ""
    echo "使用方法:"
    echo "  $0                    - 対話モードで更新"
    echo "  $0 auto               - 自動モードで更新"
    echo "  $0 --help             - このヘルプを表示"
    echo ""
    echo "機能:"
    echo "  ✓ システム更新前の自動バックアップ"
    echo "  ✓ ライセンス自動同意による無人更新"
    echo "  ✓ Webサービスの動作確認"
    echo "  ✓ カーネル更新の検出"
    echo "  ✓ 不要パッケージの自動削除"
    echo "  ✓ 更新ログの記録"
    echo "  ✓ 再起動要否の判定"
    echo ""
    echo "例:"
    echo "  sudo $0                # 対話的に更新"
    echo "  sudo $0 auto          # 自動的に更新"
}

# コマンドライン引数の処理
case "${1:-}" in
    "--help"|"-h"|"help")
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
