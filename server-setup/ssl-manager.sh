#!/bin/bash

# SSL証明書管理・監視スクリプト
# Let's Encrypt証明書の状態確認と管理

set -e

# 色付きメッセージ用の関数
print_status() {
    echo -e "\033[1;34m[STATUS]\033[0m $1"
}

print_success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

print_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

print_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

# SSL証明書の一覧表示
list_certificates() {
    print_status "SSL証明書一覧:"
    certbot certificates
}

# 証明書の詳細情報表示
show_certificate_details() {
    local domain="${1:-alecjp02.asuscomm.com}"
    
    if [ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
        print_error "ドメイン $domain の証明書が見つかりません"
        return 1
    fi
    
    print_status "証明書詳細情報: $domain"
    echo
    
    # 証明書の基本情報
    echo "📄 証明書パス: /etc/letsencrypt/live/$domain/"
    echo "🗂️  証明書ファイル: fullchain.pem"
    echo "🔑 秘密鍵ファイル: privkey.pem"
    echo
    
    # 有効期限情報
    print_status "有効期限情報:"
    openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -dates
    
    # 残り日数計算
    local exp_date=$(openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -enddate | cut -d= -f2)
    local exp_epoch=$(date -d "$exp_date" +%s)
    local now_epoch=$(date +%s)
    local days_left=$(( (exp_epoch - now_epoch) / 86400 ))
    
    echo "⏳ 有効期限まで: $days_left 日"
    
    if [ $days_left -lt 30 ]; then
        print_warning "証明書の有効期限が30日以内です！"
    elif [ $days_left -lt 7 ]; then
        print_error "証明書の有効期限が7日以内です！至急更新してください！"
    else
        print_success "証明書は有効です"
    fi
    
    echo
    
    # 証明書の詳細内容
    print_status "証明書内容:"
    openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -text | grep -E "(Subject:|Issuer:|DNS:|Not Before|Not After)"
}

# SSL接続テスト
test_ssl_connection() {
    local domain="${1:-alecjp02.asuscomm.com}"
    
    print_status "SSL接続テスト: $domain"
    
    # HTTPSアクセステスト
    if curl -s --max-time 10 "https://$domain" >/dev/null 2>&1; then
        print_success "✅ HTTPS接続成功"
    else
        print_error "❌ HTTPS接続失敗"
        return 1
    fi
    
    # SSL証明書チェーン検証
    if openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -noout >/dev/null 2>&1; then
        print_success "✅ SSL証明書チェーン検証成功"
    else
        print_error "❌ SSL証明書チェーン検証失敗"
    fi
    
    # SSL Labs風の簡易評価
    print_status "SSL設定評価:"
    local ssl_info=$(openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null)
    
    if echo "$ssl_info" | grep -q "TLSv1.3"; then
        print_success "✅ TLS 1.3 サポート"
    elif echo "$ssl_info" | grep -q "TLSv1.2"; then
        print_warning "⚠️  TLS 1.2 のみサポート (TLS 1.3推奨)"
    else
        print_error "❌ 古いTLSバージョン"
    fi
}

# 証明書の更新
renew_certificate() {
    local domain="${1:-all}"
    
    print_status "証明書更新を実行します..."
    
    if [ "$domain" = "all" ]; then
        certbot renew
    else
        certbot renew --cert-name "$domain"
    fi
    
    # Apache再読み込み
    systemctl reload apache2
    print_success "証明書更新完了"
}

# 自動更新設定の確認
check_auto_renewal() {
    print_status "自動更新設定確認:"
    
    # cronジョブ確認
    if crontab -l 2>/dev/null | grep -q "certbot renew"; then
        print_success "✅ cron自動更新設定済み"
        echo "設定内容:"
        crontab -l | grep "certbot renew"
    else
        print_warning "⚠️  cron自動更新が設定されていません"
        echo "設定するには以下を実行:"
        echo "(crontab -l 2>/dev/null; echo '0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload apache2') | crontab -"
    fi
    
    # systemd timer確認
    if systemctl is-enabled certbot.timer >/dev/null 2>&1; then
        print_success "✅ systemd timer有効"
        systemctl status certbot.timer --no-pager
    else
        print_status "systemd timerは無効です"
    fi
}

# Apache SSL設定確認
check_apache_ssl() {
    print_status "Apache SSL設定確認:"
    
    # SSL模듈確인
    if apache2ctl -M 2>/dev/null | grep -q ssl_module; then
        print_success "✅ SSL モジュール有効"
    else
        print_error "❌ SSL モジュール無効"
        echo "有効化: a2enmod ssl"
    fi
    
    # SSL VirtualHost確認
    if apache2ctl -S 2>/dev/null | grep -q ":443"; then
        print_success "✅ SSL VirtualHost設定済み"
        echo "SSL サイト一覧:"
        apache2ctl -S 2>/dev/null | grep ":443"
    else
        print_warning "⚠️  SSL VirtualHost未設定"
    fi
}

# ログ分析
analyze_ssl_logs() {
    local domain="${1:-alecjp02.asuscomm.com}"
    
    print_status "SSL関連ログ分析:"
    
    # Apache SSL エラーログ
    if [ -f "/var/log/apache2/${domain}-ssl-error.log" ]; then
        echo "最近のSSLエラー (最新10件):"
        tail -10 "/var/log/apache2/${domain}-ssl-error.log" | grep -i ssl || echo "SSLエラーなし"
    fi
    
    # Let's Encrypt ログ
    if [ -f "/var/log/letsencrypt/letsencrypt.log" ]; then
        echo
        echo "最近のLet's Encryptログ (最新5件):"
        tail -5 /var/log/letsencrypt/letsencrypt.log
    fi
}

# メニュー表示
show_menu() {
    echo "🔒 SSL証明書管理ツール"
    echo
    echo "1) 証明書一覧表示"
    echo "2) 証明書詳細情報表示"
    echo "3) SSL接続テスト"
    echo "4) 証明書更新"
    echo "5) 自動更新設定確認"
    echo "6) Apache SSL設定確認"
    echo "7) SSL関連ログ分析"
    echo "8) 全体ヘルスチェック"
    echo "0) 終了"
    echo
}

# 全体ヘルスチェック
health_check() {
    local domain="${1:-alecjp02.asuscomm.com}"
    
    print_status "SSL証明書ヘルスチェック実行中..."
    echo
    
    show_certificate_details "$domain"
    echo
    test_ssl_connection "$domain"
    echo
    check_auto_renewal
    echo
    check_apache_ssl
    
    print_success "ヘルスチェック完了"
}

# メイン処理
main() {
    if [ $# -eq 0 ]; then
        # インタラクティブモード
        while true; do
            show_menu
            read -p "選択してください (0-8): " choice
            echo
            
            case $choice in
                1) list_certificates ;;
                2) show_certificate_details ;;
                3) test_ssl_connection ;;
                4) renew_certificate ;;
                5) check_auto_renewal ;;
                6) check_apache_ssl ;;
                7) analyze_ssl_logs ;;
                8) health_check ;;
                0) echo "終了します"; exit 0 ;;
                *) print_error "無効な選択です" ;;
            esac
            echo
            read -p "Enterキーを押して続行..."
            clear
        done
    else
        # コマンドラインモード
        case $1 in
            list) list_certificates ;;
            details) show_certificate_details "$2" ;;
            test) test_ssl_connection "$2" ;;
            renew) renew_certificate "$2" ;;
            health) health_check "$2" ;;
            *) 
                echo "使用方法: $0 [list|details|test|renew|health] [ドメイン名]"
                exit 1
                ;;
        esac
    fi
}

# スクリプト実行
main "$@"
