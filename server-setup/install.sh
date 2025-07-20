#!/bin/bash
# Aivis-chan Bot ステータスページ インストールスクリプト
# openSUSE Leap 15.4+ 用

set -e

# カラーコード
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 設定変数
PROJECT_NAME="aivis-status"
DOMAIN_NAME="${DOMAIN_NAME:-status.yourdomain.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@yourdomain.com}"
WEBSERVER="${WEBSERVER:-apache}"  # apache または nginx

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

# openSUSEバージョン確認
check_opensuse() {
    if [ ! -f /etc/os-release ]; then
        error "openSUSE Leapが検出されませんでした"
        exit 1
    fi
    
    source /etc/os-release
    if [[ ! "$NAME" =~ "openSUSE Leap" ]]; then
        error "このスクリプトはopenSUSE Leap専用です"
        exit 1
    fi
    
    log "検出されたOS: $PRETTY_NAME"
}

# パッケージマネージャーの更新
update_system() {
    log "システムパッケージを更新中..."
    zypper refresh
    
    # ライセンス自動同意オプション付きで更新
    zypper update -y --auto-agree-with-licenses
    
    success "システム更新完了"
}

# Webサーバーのインストール
install_webserver() {
    case "$WEBSERVER" in
        "apache")
            install_apache
            ;;
        "nginx")
            install_nginx
            ;;
        *)
            error "サポートされていないWebサーバー: $WEBSERVER"
            exit 1
            ;;
    esac
}

# Apache のインストール
install_apache() {
    log "Apache2をインストール中..."
    
    # 静的サイト用のApache設定（PHPは不要）
    zypper install -y --auto-agree-with-licenses apache2
    
    # モジュールの有効化
    a2enmod rewrite
    a2enmod headers
    a2enmod ssl
    
    # サービスの有効化と開始
    systemctl enable apache2
    systemctl start apache2
    
    success "Apache2のインストール完了"
}

# Nginx のインストール
install_nginx() {
    log "Nginxをインストール中..."
    zypper install -y --auto-agree-with-licenses nginx
    
    # サービスの有効化と開始
    systemctl enable nginx
    systemctl start nginx
    
    success "Nginxのインストール完了"
}

# SSL証明書ツールのインストール
install_ssl_tools() {
    log "SSL証明書ツールをインストール中..."
    
    case "$WEBSERVER" in
        "apache")
            zypper install -y --auto-agree-with-licenses certbot python3-certbot-apache
            ;;
        "nginx")
            zypper install -y --auto-agree-with-licenses certbot python3-certbot-nginx
            ;;
    esac
    
    success "SSL証明書ツールのインストール完了"
}

# 追加ツールのインストール
install_additional_tools() {
    log "追加ツールをインストール中..."
    
    # 基本ツール
    zypper install -y --auto-agree-with-licenses git curl wget vim nano htop
    
    # 監視ツール
    zypper install -y --auto-agree-with-licenses logrotate fail2ban
    
    # ファイアウォール
    systemctl enable firewalld
    systemctl start firewalld
    
    success "追加ツールのインストール完了"
}

# ファイアウォール設定
configure_firewall() {
    log "ファイアウォールを設定中..."
    
    # HTTP/HTTPS を許可
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    
    # SSH を確実に許可
    firewall-cmd --permanent --add-service=ssh
    
    # 設定を再読み込み
    firewall-cmd --reload
    
    success "ファイアウォール設定完了"
}

# fail2banの設定
configure_fail2ban() {
    log "fail2banを設定中..."
    
    # Apache用設定
    if [ "$WEBSERVER" = "apache" ]; then
        cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[apache-auth]
enabled = true
port = http,https
filter = apache-auth
logpath = /var/log/apache2/*error.log
maxretry = 3

[apache-badbots]
enabled = true
port = http,https
filter = apache-badbots
logpath = /var/log/apache2/*access.log
maxretry = 2

[apache-noscript]
enabled = true
port = http,https
filter = apache-noscript
logpath = /var/log/apache2/*access.log
maxretry = 3
EOF
    fi
    
    systemctl enable fail2ban
    systemctl start fail2ban
    
    success "fail2ban設定完了"
}

# プロジェクトディレクトリの作成
create_project_directory() {
    log "プロジェクトディレクトリを作成中..."
    
    mkdir -p /var/www/html/$PROJECT_NAME
    chown -R wwwrun:www /var/www/html/$PROJECT_NAME
    chmod -R 755 /var/www/html/$PROJECT_NAME
    
    success "プロジェクトディレクトリ作成完了"
}

# バーチャルホストの設定
configure_virtual_host() {
    case "$WEBSERVER" in
        "apache")
            configure_apache_vhost
            ;;
        "nginx")
            configure_nginx_vhost
            ;;
    esac
}

# Apache バーチャルホスト設定
configure_apache_vhost() {
    log "Apache バーチャルホストを設定中..."
    
    cat > /etc/apache2/vhosts.d/aivis-status.conf << EOF
<VirtualHost *:80>
    ServerName $DOMAIN_NAME
    DocumentRoot /var/www/html/$PROJECT_NAME
    
    <Directory /var/www/html/$PROJECT_NAME>
        AllowOverride All
        Require all granted
        
        # CORS設定
        Header always set Access-Control-Allow-Origin "*"
        Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Directory>
    
    # ログ設定
    ErrorLog /var/log/apache2/aivis-status-error.log
    CustomLog /var/log/apache2/aivis-status-access.log combined
    
    # セキュリティヘッダー
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>

<VirtualHost *:443>
    ServerName $DOMAIN_NAME
    DocumentRoot /var/www/html/$PROJECT_NAME
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem
    
    <Directory /var/www/html/$PROJECT_NAME>
        AllowOverride All
        Require all granted
        
        # CORS設定
        Header always set Access-Control-Allow-Origin "*"
        Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Directory>
    
    # セキュリティヘッダー
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>
EOF
    
    # Apache設定テストと再読み込み
    if apache2ctl configtest; then
        systemctl reload apache2
        success "Apache バーチャルホスト設定完了"
    else
        error "Apache設定エラーが発生しました"
        exit 1
    fi
}

# Nginx バーチャルホスト設定
configure_nginx_vhost() {
    log "Nginx バーチャルホストを設定中..."
    
    cat > /etc/nginx/sites-available/aivis-status << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    root /var/www/html/$PROJECT_NAME;
    index index.html;
    
    # CORS設定
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    
    # セキュリティヘッダー
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}

server {
    listen 443 ssl;
    server_name $DOMAIN_NAME;
    root /var/www/html/$PROJECT_NAME;
    index index.html;
    
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
    # SSL設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # セキュリティヘッダー
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
    
    # sites-enabledディレクトリの作成とシンボリックリンク
    mkdir -p /etc/nginx/sites-enabled
    ln -sf /etc/nginx/sites-available/aivis-status /etc/nginx/sites-enabled/
    
    # メインのnginx.confに sites-enabled の include を追加
    if ! grep -q "include /etc/nginx/sites-enabled" /etc/nginx/nginx.conf; then
        sed -i '/include \/etc\/nginx\/conf\.d\/\*\.conf;/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
    fi
    
    # Nginx設定テストと再読み込み
    if nginx -t; then
        systemctl reload nginx
        success "Nginx バーチャルホスト設定完了"
    else
        error "Nginx設定エラーが発生しました"
        exit 1
    fi
}

# 管理スクリプトのインストール
install_management_scripts() {
    log "管理スクリプトをインストール中..."
    
    # スクリプトディレクトリの作成
    mkdir -p /usr/local/bin
    
    # デプロイスクリプト
    if [ -f "deploy.sh" ]; then
        cp deploy.sh /usr/local/bin/deploy-aivis-status.sh
        chmod +x /usr/local/bin/deploy-aivis-status.sh
    fi
    
    # バックアップスクリプト
    if [ -f "backup.sh" ]; then
        cp backup.sh /usr/local/bin/backup-aivis-status.sh
        chmod +x /usr/local/bin/backup-aivis-status.sh
    fi
    
    # 監視スクリプト
    if [ -f "monitor.sh" ]; then
        cp monitor.sh /usr/local/bin/monitor-aivis-status.sh
        chmod +x /usr/local/bin/monitor-aivis-status.sh
    fi
    
    success "管理スクリプトのインストール完了"
}

# systemdサービスのインストール
install_systemd_services() {
    log "systemdサービスをインストール中..."
    
    # バックアップサービス
    if [ -f "aivis-status-backup.service" ]; then
        cp aivis-status-backup.service /etc/systemd/system/
        cp aivis-status-backup.timer /etc/systemd/system/
        
        systemctl daemon-reload
        systemctl enable aivis-status-backup.timer
        systemctl start aivis-status-backup.timer
    fi
    
    success "systemdサービスのインストール完了"
}

# ログローテーション設定
configure_logrotate() {
    log "ログローテーションを設定中..."
    
    cat > /etc/logrotate.d/aivis-status << EOF
/var/log/apache2/aivis-status-*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 640 wwwrun www
    postrotate
        /bin/systemctl reload apache2.service > /dev/null 2>&1 || true
    endscript
}

/var/log/deploy-aivis-status.log
/var/log/backup-aivis-status.log
/var/log/monitor-aivis-status.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 root root
}
EOF
    
    success "ログローテーション設定完了"
}

# SSL証明書の取得
obtain_ssl_certificate() {
    read -p "SSL証明書を取得しますか？ [y/N]: " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "SSL証明書を取得中..."
        
        case "$WEBSERVER" in
            "apache")
                certbot --apache -d "$DOMAIN_NAME" --email "$ADMIN_EMAIL" --agree-tos --non-interactive
                ;;
            "nginx")
                certbot --nginx -d "$DOMAIN_NAME" --email "$ADMIN_EMAIL" --agree-tos --non-interactive
                ;;
        esac
        
        # 自動更新の設定
        echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
        
        success "SSL証明書の取得完了"
    else
        warn "SSL証明書の取得をスキップしました"
    fi
}

# インストール後の設定表示
show_post_install_info() {
    success "=== インストール完了 ==="
    echo
    log "次の手順で設定を完了してください："
    echo
    echo "1. ドメインのDNS設定"
    echo "   $DOMAIN_NAME をこのサーバーのIPアドレスに向けてください"
    echo
    echo "2. ステータスページファイルのデプロイ"
    echo "   sudo /usr/local/bin/deploy-aivis-status.sh"
    echo
    echo "3. 動作確認"
    echo "   http://$DOMAIN_NAME"
    echo "   https://$DOMAIN_NAME (SSL証明書を取得した場合)"
    echo
    echo "4. 定期的な管理"
    echo "   バックアップ: sudo /usr/local/bin/backup-aivis-status.sh"
    echo "   監視: sudo /usr/local/bin/monitor-aivis-status.sh"
    echo
    echo "5. ログの確認"
    echo "   tail -f /var/log/apache2/aivis-status-access.log"
    echo "   tail -f /var/log/apache2/aivis-status-error.log"
    echo
    success "セットアップガイドの詳細は opensuse-setup.md を参照してください"
}

# メイン処理
main() {
    echo "================================================================"
    echo "  Aivis-chan Bot ステータスページ インストーラー"
    echo "  openSUSE Leap 用"
    echo "================================================================"
    echo
    
    log "インストールを開始します..."
    
    check_root
    check_opensuse
    
    # 設定確認
    echo "=== 設定確認 ==="
    echo "ドメイン名: $DOMAIN_NAME"
    echo "管理者メール: $ADMIN_EMAIL"
    echo "Webサーバー: $WEBSERVER"
    echo
    
    read -p "この設定でインストールを続行しますか？ [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "インストールをキャンセルしました"
        exit 0
    fi
    
    # インストール実行
    update_system
    install_webserver
    install_ssl_tools
    install_additional_tools
    configure_firewall
    configure_fail2ban
    create_project_directory
    configure_virtual_host
    install_management_scripts
    install_systemd_services
    configure_logrotate
    obtain_ssl_certificate
    
    show_post_install_info
}

# ヘルプ表示
show_help() {
    echo "Aivis-chan Bot ステータスページ インストーラー"
    echo
    echo "使用方法:"
    echo "  sudo ./install.sh                    - デフォルト設定でインストール"
    echo "  sudo DOMAIN_NAME=your.domain ./install.sh - カスタムドメインでインストール"
    echo "  sudo WEBSERVER=nginx ./install.sh    - Nginxを使用してインストール"
    echo
    echo "環境変数:"
    echo "  DOMAIN_NAME   - ドメイン名 (デフォルト: status.yourdomain.com)"
    echo "  ADMIN_EMAIL   - 管理者メールアドレス (デフォルト: admin@yourdomain.com)"
    echo "  WEBSERVER     - Webサーバー (apache|nginx, デフォルト: apache)"
    echo
    echo "例:"
    echo "  sudo DOMAIN_NAME=status.example.com ADMIN_EMAIL=admin@example.com ./install.sh"
}

# コマンドライン引数の処理
case "${1:-}" in
    "--help"|"-h"|"help")
        show_help
        exit 0
        ;;
    "")
        main
        ;;
    *)
        error "不明なオプション: $1"
        show_help
        exit 1
        ;;
esac
