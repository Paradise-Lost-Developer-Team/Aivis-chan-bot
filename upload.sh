#!/bin/bash
# Aivis-chan Bot Website アップロードスクリプト (SCP版)
# Apache サーバーへの手動アップロード用


SERVER_HOST="alecjp02.asuscomm.com"
SERVER_USER="alec"
TEMP_PATH="/home/alec/temp-upload"
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


# 一時ディレクトリ準備
print_info "一時ディレクトリをサーバー上に作成..."
ssh "$SERVER_USER@$SERVER_HOST" "rm -rf $TEMP_PATH && mkdir -p $TEMP_PATH/css $TEMP_PATH/js $TEMP_PATH/images"
print_success "一時ディレクトリ作成完了"

# ファイルを一時ディレクトリにアップロード
print_info "ファイルを一時ディレクトリにアップロード..."
scp index.html offline.html "$SERVER_USER@$SERVER_HOST:$TEMP_PATH/"
scp manifest.json sw.js "$SERVER_USER@$SERVER_HOST:$TEMP_PATH/"
scp css/main.css "$SERVER_USER@$SERVER_HOST:$TEMP_PATH/css/"
scp js/*.js "$SERVER_USER@$SERVER_HOST:$TEMP_PATH/js/"
scp -r images/* "$SERVER_USER@$SERVER_HOST:$TEMP_PATH/images/"
print_success "一時ディレクトリへのアップロード完了"

# サーバー側で自動デプロイ処理
print_info "サーバーで自動デプロイ処理を実行..."
ssh $SERVER_USER@$SERVER_HOST "sudo cp -r $TEMP_PATH/* $SERVER_PATH/; sudo chown -R wwwrun:www $SERVER_PATH/*; sudo chmod -R 644 $SERVER_PATH/*; sudo find $SERVER_PATH -type d -exec chmod 755 {} \;; cd $SERVER_PATH; sudo npm install; pm2 delete bot-stats-server 2>/dev/null || echo 'No existing process to delete'; pm2 start bot-stats-server.js --name bot-stats-server; pm2 save; pm2 logs bot-stats-server --lines 20; rm -rf $TEMP_PATH"
print_success "サーバー側の自動デプロイ完了"

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
