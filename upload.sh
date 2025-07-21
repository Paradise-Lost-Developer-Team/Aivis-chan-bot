#!/bin/bash
# Aivis-chan Bot Website アップロードスクリプト 
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
required_files=("index.html" "manifest.json" "sw.js" "offline.html" "css/style.css" "js/main.js")

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
sudo mkdir -p "${SERVER_PATH}/css" "${SERVER_PATH}/js" "${SERVER_PATH}/images"
print_success "公開ディレクトリOK"

# ファイルアップロード
print_info "ファイルをアップロード中..."

# HTMLファイル
print_info "HTMLファイルのコピー..."
html_files=( *.html )
if [[ ${#html_files[@]} -eq 0 ]]; then
    print_warning "HTMLファイルがありません"
else
    for file in *.html; do
        if [[ -f "$file" ]]; then
            sudo cp "$file" "${SERVER_PATH}/"
            if [[ $? -eq 0 ]]; then
                print_success "$file コピー完了"
            else
                print_error "$file コピー失敗"
                exit 1
            fi
        fi
    done
fi

# サブディレクトリのindex.htmlもコピー
for dir in faq docs privacy terms contact status; do
    if [[ -f "$dir/index.html" ]]; then
        sudo mkdir -p "${SERVER_PATH}/$dir"
        sudo cp "$dir/index.html" "${SERVER_PATH}/$dir/index.html"
        if [[ $? -eq 0 ]]; then
            print_success "$dir/index.html コピー完了"
        else
            print_error "$dir/index.html コピー失敗"
            exit 1
        fi
    else
        print_warning "$dir/index.html がありません"
    fi
done

# PWA関連ファイル
print_info "PWAファイルのコピー..."
for file in manifest.json sw.js; do
    if [[ -f "$file" ]]; then
        sudo cp "$file" "${SERVER_PATH}/"
        if [[ $? -eq 0 ]]; then
            print_success "$file コピー完了"
        else
            print_error "$file コピー失敗"
            exit 1
        fi
    else
        print_warning "$file がありません"
    fi
done

# .envファイルのコピー
print_info ".envファイルのコピー..."
if [[ -f ".env" ]]; then
    sudo cp .env "${SERVER_PATH}/.env"
    if [[ $? -eq 0 ]]; then
        print_success ".env コピー完了"
    else
        print_error ".env コピー失敗"
        exit 1
    fi
else
    print_warning ".envファイルがありません"
fi

# CSS/JSファイル
print_info "CSS/JSファイルのコピー..."
css_files=( css/*.css )
if [[ ${#css_files[@]} -eq 0 ]]; then
    print_warning "CSSファイルがありません"
else
    for file in css/*.css; do
        if [[ -f "$file" ]]; then
            sudo cp "$file" "${SERVER_PATH}/css/"
            if [[ $? -eq 0 ]]; then
                print_success "$file コピー完了"
            else
                print_error "$file コピー失敗"
                exit 1
            fi
        fi
    done
fi
js_files=( js/*.js )
if [[ ${#js_files[@]} -eq 0 ]]; then
    print_warning "JSファイルがありません"
else
    for file in js/*.js; do
        if [[ -f "$file" ]]; then
            sudo cp "$file" "${SERVER_PATH}/js/"
            if [[ $? -eq 0 ]]; then
                print_success "$file コピー完了"
                if [[ "$file" == "js/main.js" ]]; then
                    print_info "main.jsのサーバー上の内容を表示（デバッグ）..."
                    sudo cat "${SERVER_PATH}/js/main.js" | head -n 20
                fi
            else
                print_error "$file コピー失敗"
                exit 1
            fi
        fi
    done
fi

# 画像ファイル（空ディレクトリ対応）
print_info "画像ファイルのコピー..."
if [[ -z $(ls -A images) ]]; then
    print_warning "画像ファイルがありません（imagesディレクトリは空です）"
else
    sudo cp -r images/. "${SERVER_PATH}/images/"
    if [[ $? -eq 0 ]]; then
        print_success "画像ファイル コピー完了"
    else
        print_error "画像ファイル コピー失敗"
        exit 1
    fi
fi

# ファイル権限設定
print_info "ファイル権限を設定..."
sudo chown -R wwwrun:www "${SERVER_PATH}"
sudo find "${SERVER_PATH}" -type f -exec chmod 644 {} \;
sudo find "${SERVER_PATH}" -type d -exec chmod 755 {} \;
print_success "ファイル権限設定完了"

# Apache設定のリロード
print_info "Apache設定をリロード..."
sudo systemctl reload apache2
if [[ $? -eq 0 ]]; then
    print_success "Apache リロード完了"
else
    print_warning "Apache リロードに問題がある可能性があります"
fi

# pm2の再起動
print_info "pm2の再起動..."
if command -v pm2 &> /dev/null; then
    pm2 delete bot-stats-server 2>/dev/null || echo 'No existing process to delete'
    pm2 start bot-stats-server.js --name bot-stats-server
    pm2 save
    if [[ $? -eq 0 ]]; then
        print_success "pm2 再起動完了"
    else
        print_error "pm2 再起動失敗"
        exit 1
    fi
else
    print_warning "pm2 がインストールされていません"
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