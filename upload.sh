#!/bin/bash
# Aivis-chan Bot Website アップロードスクリプト (SCP版)
# Apache サーバーへの手動アップロード用

# ローカル公開ディレクトリ（必要に応じて変更）
SERVER_PATH="/srv/www/htdocs"


# 色付きメッセージ用関数（printfで互換性向上）
print_success() { printf "\033[32m✅ %s\033[0m\n" "$1"; }
print_error()   { printf "\033[31m❌ %s\033[0m\n" "$1"; }
print_warning() { printf "\033[33m⚠️  %s\033[0m\n" "$1"; }
print_info()    { printf "\033[36m🔍 %s\033[0m\n" "$1"; }

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

# ディレクトリの準備
print_info "公開ディレクトリを準備..."
sudo mkdir -p ${SERVER_PATH}/{css,js,images}
print_success "公開ディレクトリOK"

# ファイルアップロード
print_info "ファイルをアップロード中..."

# HTMLファイル
print_info "HTMLファイルのコピー..."
sudo cp index.html offline.html ${SERVER_PATH}/
if [[ $? -eq 0 ]]; then
    print_success "HTMLファイル コピー完了"
else
    print_error "HTMLファイル コピー失敗"
    exit 1
fi

# PWA関連ファイル
print_info "PWAファイルのコピー..."
sudo cp manifest.json sw.js ${SERVER_PATH}/
if [[ $? -eq 0 ]]; then
    print_success "PWAファイル コピー完了"
else
    print_error "PWAファイル コピー失敗"
    exit 1
fi

# CSS/JSファイル
print_info "CSS/JSファイルのコピー..."
css_js_files=("css/main.css" "js/main.js")
for file in "${css_js_files[@]}"; do
    sudo cp "$file" ${SERVER_PATH}/$(dirname "$file")/
    if [[ $? -eq 0 ]]; then
        print_success "$file コピー完了"
    else
        print_error "$file コピー失敗"
        exit 1
    fi
done

# 画像ファイル（空ディレクトリ対応）
print_info "画像ファイルのコピー..."
shopt -s nullglob
img_files=(images/*)
if [[ ${#img_files[@]} -eq 0 ]]; then
    print_warning "画像ファイルがありません（imagesディレクトリは空です）"
else
    sudo cp -r images/* ${SERVER_PATH}/images/
    if [[ $? -eq 0 ]]; then
        print_success "画像ファイル コピー完了"
    else
        print_error "画像ファイル コピー失敗"
        exit 1
    fi
fi
shopt -u nullglob

# ファイル権限設定
print_info "ファイル権限を設定..."
sudo chown -R wwwrun:www ${SERVER_PATH}
sudo chmod -R 644 ${SERVER_PATH}/*
sudo find ${SERVER_PATH} -type d -exec chmod 755 {} \;
print_success "ファイル権限設定完了"

# Apache設定のリロード
print_info "Apache設定をリロード..."
sudo systemctl reload apache2
if [[ $? -eq 0 ]]; then
    print_success "Apache リロード完了"
else
    print_warning "Apache リロードに問題がある可能性があります"
fi

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
echo "$(date '+%Y-%m-%d %H:%M:%S') - Deploy completed - Files: ${required_files[*]}, Dirs: images css js" >> deploy.log
print_info "デプロイログを deploy.log に記録しました"
