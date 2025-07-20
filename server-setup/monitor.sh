#!/bin/bash
# Aivis-chan Bot ステータスページ 監視スクリプト
# openSUSE Leap用

set -e

# 設定変数
PROJECT_NAME="aivis-status"
WEB_ROOT="/var/www/html"
PROJECT_DIR="$WEB_ROOT/$PROJECT_NAME"
LOG_FILE="/var/log/monitor-aivis-status.log"
ALERT_EMAIL="${ALERT_EMAIL:-admin@localhost}"
CHECK_INTERVAL=60  # 秒

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# アラート送信
send_alert() {
    local subject="$1"
    local message="$2"
    
    log "ALERT: $subject"
    
    # メール送信（mailコマンドが利用可能な場合）
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    fi
    
    # systemd journal にも記録
    logger -t "aivis-status-monitor" "ALERT: $subject - $message"
}

# Webサーバーステータス確認
check_webserver() {
    local status="OK"
    local message=""
    
    # Apache確認
    if systemctl is-enabled --quiet apache2 2>/dev/null; then
        if ! systemctl is-active --quiet apache2; then
            status="ERROR"
            message="Apache is not running"
            send_alert "Aivis Status - Apache Down" "Apache webserver is not running on $(hostname)"
        fi
    fi
    
    # Nginx確認
    if systemctl is-enabled --quiet nginx 2>/dev/null; then
        if ! systemctl is-active --quiet nginx; then
            status="ERROR"
            message="Nginx is not running"
            send_alert "Aivis Status - Nginx Down" "Nginx webserver is not running on $(hostname)"
        fi
    fi
    
    log "Webserver Status: $status $message"
}

# Webサイトアクセス確認
check_website() {
    local status="OK"
    local message=""
    local http_code
    
    # HTTP確認
    http_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/$PROJECT_NAME/ 2>/dev/null || echo "000")
    
    if [ "$http_code" != "200" ]; then
        status="ERROR"
        message="HTTP $http_code"
        send_alert "Aivis Status - Website Down" "Website is returning HTTP $http_code on $(hostname)"
    fi
    
    log "Website Access: $status $message (HTTP $http_code)"
}

# ディスク容量確認
check_disk_space() {
    local status="OK"
    local message=""
    local usage
    
    usage=$(df "$WEB_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -gt 90 ]; then
        status="CRITICAL"
        message="Disk usage: ${usage}%"
        send_alert "Aivis Status - Disk Space Critical" "Disk usage is ${usage}% on $(hostname)"
    elif [ "$usage" -gt 80 ]; then
        status="WARNING"
        message="Disk usage: ${usage}%"
        log "WARNING: High disk usage: ${usage}%"
    fi
    
    log "Disk Space: $status $message"
}

# SSL証明書確認
check_ssl_certificate() {
    local status="OK"
    local message=""
    local domain="status.yourdomain.com"  # 実際のドメインに変更
    local expiry_days
    
    if command -v openssl &> /dev/null; then
        # SSL証明書の有効期限確認
        expiry_date=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | \
                     openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
        
        if [ -n "$expiry_date" ]; then
            expiry_timestamp=$(date -d "$expiry_date" +%s 2>/dev/null)
            current_timestamp=$(date +%s)
            expiry_days=$(( (expiry_timestamp - current_timestamp) / 86400 ))
            
            if [ "$expiry_days" -lt 7 ]; then
                status="CRITICAL"
                message="SSL expires in $expiry_days days"
                send_alert "Aivis Status - SSL Certificate Expiring" "SSL certificate for $domain expires in $expiry_days days"
            elif [ "$expiry_days" -lt 30 ]; then
                status="WARNING"
                message="SSL expires in $expiry_days days"
                log "WARNING: SSL certificate expires in $expiry_days days"
            else
                message="SSL valid for $expiry_days days"
            fi
        fi
    fi
    
    log "SSL Certificate: $status $message"
}

# ファイル整合性確認
check_file_integrity() {
    local status="OK"
    local message=""
    
    # 重要なファイルの存在確認
    local required_files=(
        "$PROJECT_DIR/index.html"
        "$PROJECT_DIR/css/style.css"
        "$PROJECT_DIR/js/status.js"
        "$PROJECT_DIR/js/api-config.js"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            status="ERROR"
            message="Missing file: $(basename "$file")"
            send_alert "Aivis Status - Missing Files" "Required file missing: $file on $(hostname)"
            break
        fi
    done
    
    # ファイル権限確認
    if [ -d "$PROJECT_DIR" ]; then
        local wrong_perms=$(find "$PROJECT_DIR" -type f ! -perm 644 2>/dev/null | wc -l)
        if [ "$wrong_perms" -gt 0 ]; then
            status="WARNING"
            message="$wrong_perms files with wrong permissions"
            log "WARNING: $wrong_perms files have incorrect permissions"
        fi
    fi
    
    log "File Integrity: $status $message"
}

# ログファイルサイズ確認
check_log_sizes() {
    local status="OK"
    local message=""
    
    # アクセスログのサイズ確認（100MB以上で警告）
    local access_log="/var/log/apache2/aivis-status-access.log"
    if [ -f "$access_log" ]; then
        local size=$(stat -c%s "$access_log" 2>/dev/null || echo 0)
        local size_mb=$((size / 1024 / 1024))
        
        if [ "$size_mb" -gt 100 ]; then
            status="WARNING"
            message="Large log file: ${size_mb}MB"
            log "WARNING: Access log is ${size_mb}MB"
        fi
    fi
    
    log "Log Files: $status $message"
}

# プロセス確認
check_processes() {
    local status="OK"
    local message=""
    local high_cpu_procs
    
    # CPU使用率の高いプロセス確認
    high_cpu_procs=$(ps aux --sort=-%cpu | awk 'NR<=6 && $3>80 {print $11" ("$3"%)"}' | grep -v "COMMAND" || true)
    
    if [ -n "$high_cpu_procs" ]; then
        status="WARNING"
        message="High CPU usage detected"
        log "WARNING: High CPU processes: $high_cpu_procs"
    fi
    
    log "Process Status: $status $message"
}

# 統合ヘルスチェック
run_health_check() {
    log "=== Health Check Started ==="
    
    check_webserver
    check_website
    check_disk_space
    check_ssl_certificate
    check_file_integrity
    check_log_sizes
    check_processes
    
    log "=== Health Check Completed ==="
}

# レポート生成
generate_report() {
    local report_file="/tmp/aivis-status-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "=== Aivis-chan Bot Status Page Health Report ==="
        echo "Generated: $(date)"
        echo "Hostname: $(hostname)"
        echo ""
        
        echo "=== System Information ==="
        uptime
        echo "Load average: $(cat /proc/loadavg)"
        echo "Memory usage: $(free -h | grep '^Mem:' | awk '{print $3"/"$2" ("$3/$2*100"%)"}')"
        echo ""
        
        echo "=== Web Server Status ==="
        systemctl is-active apache2 2>/dev/null && echo "Apache: Running" || echo "Apache: Not running"
        systemctl is-active nginx 2>/dev/null && echo "Nginx: Running" || echo "Nginx: Not running"
        echo ""
        
        echo "=== Disk Usage ==="
        df -h "$WEB_ROOT"
        echo ""
        
        echo "=== Recent Log Entries ==="
        tail -10 "$LOG_FILE" 2>/dev/null || echo "No log entries found"
        
    } > "$report_file"
    
    echo "$report_file"
}

# 使用方法表示
show_usage() {
    echo "Aivis-chan Bot Status Page Monitor"
    echo ""
    echo "Usage:"
    echo "  $0 check       - Run single health check"
    echo "  $0 monitor     - Run continuous monitoring"
    echo "  $0 report      - Generate health report"
    echo "  $0 --help      - Show this help"
}

# メイン処理
main() {
    case "${1:-check}" in
        "check")
            run_health_check
            ;;
        "monitor")
            log "Starting continuous monitoring (interval: ${CHECK_INTERVAL}s)"
            while true; do
                run_health_check
                sleep "$CHECK_INTERVAL"
            done
            ;;
        "report")
            report_file=$(generate_report)
            echo "Health report generated: $report_file"
            cat "$report_file"
            ;;
        "--help"|"-h"|"help")
            show_usage
            ;;
        *)
            echo "Error: Unknown option '$1'"
            show_usage
            exit 1
            ;;
    esac
}

# スクリプト実行
main "$@"
