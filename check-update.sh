#!/bin/bash
# Aivis-chan Bot Website 更新確認スクリプト

# 色付きメッセージ用関数
print_success() { echo -e "\e[32m✅ $1\e[0m"; }
print_error() { echo -e "\e[31m❌ $1\e[0m"; }
print_warning() { echo -e "\e[33m⚠️  $1\e[0m"; }
print_info() { echo -e "\e[36m🔍 $1\e[0m"; }

echo "🔍 Aivis-chan Bot Website 更新前チェック"

# 1. ファイル構文チェック
print_info "HTML構文チェック..."
if command -v html5validator &> /dev/null; then
    html5validator --root . --also-check-css
    if [[ $? -eq 0 ]]; then
        print_success "HTML構文OK"
    else
        print_error "HTML構文エラーあり"
    fi
else
    print_warning "html5validator が見つかりません（省略）"
fi

# 2. JavaScript構文チェック（簡易）
print_info "JavaScript構文チェック..."
if grep -q "class AivisWebsite" js/main.js; then
    print_success "JavaScript基本構文OK"
else
    print_error "JavaScript構文エラーの可能性"
fi

# 3. CSS構文チェック（簡易）
print_info "CSS構文チェック..."
if grep -q ":root" css/main.css; then
    print_success "CSS基本構文OK"
else
    print_error "CSS構文エラーの可能性"
fi

# 4. Bot ID確認
print_info "Bot ID設定確認..."
bot_ids=("1333819940645638154" "1334732369831268352" "1334734681656262770" "1365633502988472352" "1365633586123771934" "1365633656173101086")
all_found=true

for bot_id in "${bot_ids[@]}"; do
    if grep -q "$bot_id" js/main.js; then
        echo "  ✅ Bot ID $bot_id 確認"
    else
        echo "  ❌ Bot ID $bot_id が見つかりません"
        all_found=false
    fi
done

if $all_found; then
    print_success "全Bot ID設定確認完了"
else
    print_error "Bot ID設定に問題があります"
fi

# 5. API エンドポイント確認
print_info "API エンドポイント設定確認..."
if grep -q "status.aivis-chan-bot.com/api" js/main.js; then
    print_success "API エンドポイント設定OK"
else
    print_warning "API エンドポイント設定を確認してください"
fi

# 6. 必須ファイル存在確認
print_info "必須ファイル存在確認..."
required_files=("index.html" "css/main.css" "js/main.js" "manifest.json" "sw.js" "offline.html")

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file が見つかりません"
    fi
done

# 7. 画像ディレクトリ確認
print_info "画像ディレクトリ確認..."
if [[ -d "images" ]]; then
    image_count=$(find images -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.svg" \) | wc -l)
    print_success "画像ディレクトリ確認 ($image_count ファイル)"
else
    print_warning "images ディレクトリが見つかりません"
fi

echo ""
echo "🚀 更新準備完了！以下のコマンドでアップロードできます："
echo "   ./upload.sh"
echo ""
echo "📋 更新前の最終確認："
echo "   - ローカルでテスト済みか？"
echo "   - Bot APIエンドポイントは正しいか？"
echo "   - バックアップは取得済みか？"
