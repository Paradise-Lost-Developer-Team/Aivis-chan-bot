#!/bin/bash
# Aivis-chan Bot Website アップロードスクリプト (SCP版)
# Apache サーバーへの手動アップロード用

# サーバー設定
SERVER_HOST="alecjp02.asuscomm.com"
SERVER_USER="alec"
SERVER_PATH="/srv/www/htdocs/aivis-chan-bot.com"

# 色付きメッセージ用関数
print_success() { echo -e "\e[32m✅ $1\e[0m"; }
print_error() { echo -e "\e[31m❌ $1\e[0m"; }
print_warning() { echo -e "\e[33m⚠️  $1\e[0m"; }
print_info() { echo -e "\e[36m🔍 $1\e[0m"; }

echo "🚀 Aivis-chan Bot Website アップロード開始"

# ファイル存在チェック
print_info "ファイル存在チェック..."
required_files=("index.html" "manifest.json" "sw.js" "offline.html" "css/main.css" "js/main.js")

for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        print_error "$file が見つかりません"
        exit 1
    fi
done

if [[ ! -d "images" ]]; then
    print_error "imagesディレクトリが見つかりません"
    exit 1
fi

print_success "全ファイルの存在を確認"

# リモートディレクトリの準備
print_info "サーバー上のディレクトリを準備..."
ssh ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${SERVER_PATH}/{css,js,images}"

if [[ $? -ne 0 ]]; then
    print_error "サーバー接続に失敗しました"
    exit 1
fi

print_success "サーバー接続OK"

# ファイルアップロード
print_info "ファイルをアップロード中..."

# HTMLファイル
print_info "HTMLファイルのアップロード..."
scp index.html offline.html ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/
if [[ $? -eq 0 ]]; then
    print_success "HTMLファイル アップロード完了"
else
    print_error "HTMLファイル アップロード失敗"
    exit 1
fi

# PWA関連ファイル
print_info "PWAファイルのアップロード..."
scp manifest.json sw.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/
if [[ $? -eq 0 ]]; then
    print_success "PWAファイル アップロード完了"
else
    print_error "PWAファイル アップロード失敗"
    exit 1
fi

# CSS/JSファイル
print_info "CSS/JSファイルのアップロード..."
scp css/main.css ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/css/
scp js/main.js ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/js/
if [[ $? -eq 0 ]]; then
    print_success "CSS/JSファイル アップロード完了"
else
    print_error "CSS/JSファイル アップロード失敗"
    exit 1
fi

# 画像ファイル
print_info "画像ファイルのアップロード..."
scp -r images/* ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/images/
if [[ $? -eq 0 ]]; then
    print_success "画像ファイル アップロード完了"
else
    print_warning "画像ファイル アップロードに問題がある可能性があります"
fi

# ファイル権限設定
print_info "ファイル権限を設定..."
ssh ${SERVER_USER}@${SERVER_HOST} "sudo chown -R wwwrun:www ${SERVER_PATH} && sudo chmod -R 644 ${SERVER_PATH}/* && sudo find ${SERVER_PATH} -type d -exec chmod 755 {} \;"

if [[ $? -eq 0 ]]; then
    print_success "ファイル権限設定完了"
else
    print_warning "ファイル権限設定に問題がある可能性があります"
fi

# Apache設定の確認・リロード
print_info "Apache設定を確認..."
ssh ${SERVER_USER}@${SERVER_HOST} "sudo systemctl reload apache2"

if [[ $? -eq 0 ]]; then
    print_success "Apache リロード完了"
else
    print_warning "Apache リロードに問題がある可能性があります"
fi

# アップロード確認
print_info "Webサイトアクセス確認..."
response_code=$(curl -s -o /dev/null -w "%{http_code}" https://aivis-chan-bot.com)

if [[ "$response_code" == "200" ]]; then
    print_success "Webサイトアクセス確認OK (HTTP $response_code)"
elif [[ "$response_code" == "000" ]]; then
    print_warning "Webサイトアクセス確認失敗 (接続できません)"
else
    print_warning "Webサイトアクセス: HTTP $response_code"
fi

echo ""
echo "🎉 アップロード完了!"
echo "🌐 https://aivis-chan-bot.com でアクセス可能です"
echo ""

# デプロイログの記録
echo "$(date '+%Y-%m-%d %H:%M:%S') - Deploy completed - Files: ${required_files[*]}" >> deploy.log
print_info "デプロイログを deploy.log に記録しました"
