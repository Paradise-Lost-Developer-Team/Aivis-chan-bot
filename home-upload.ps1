# ホームディレクトリ経由アップロードスクリプト
# 権限問題を回避するため、一時的にホームディレクトリを経由

$SERVER_HOST = "alecjp02.asuscomm.com"
$SERVER_USER = "alec"
$TEMP_PATH = "/home/alec/temp-upload"
$SERVER_PATH = "/srv/www/htdocs"

function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "🔍 $msg" -ForegroundColor Cyan }

Write-Host "🚀 Aivis-chan Bot Website アップロード (ホームディレクトリ経由)" -ForegroundColor Magenta

# ファイル確認
$files = @("index.html", "manifest.json", "sw.js", "offline.html")
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Error "$file が見つかりません"
        exit 1
    }
}
Write-Success "必要ファイルの存在確認完了"

# サーバー上に一時ディレクトリ作成
Write-Info "サーバー上に一時ディレクトリを作成..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${TEMP_PATH}/{css,js,images} && echo '一時ディレクトリ作成完了'"

# ファイルを一時ディレクトリにアップロード
Write-Info "一時ディレクトリにファイルアップロード..."

# HTMLファイル
Write-Info "HTMLファイルをアップロード..."
scp index.html offline.html "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/"
if ($LASTEXITCODE -eq 0) { Write-Success "HTML完了" } else { Write-Error "HTML失敗" }

# PWAファイル
Write-Info "PWAファイルをアップロード..."
scp manifest.json sw.js "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/"
if ($LASTEXITCODE -eq 0) { Write-Success "PWA完了" } else { Write-Error "PWA失敗" }

# CSS
Write-Info "CSSファイルをアップロード..."
scp css/main.css "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/css/"
if ($LASTEXITCODE -eq 0) { Write-Success "CSS完了" } else { Write-Error "CSS失敗" }

# JS
Write-Info "JSファイルをアップロード..."
scp js/main.js "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/js/"
if ($LASTEXITCODE -eq 0) { Write-Success "JS完了" } else { Write-Error "JS失敗" }

# 画像
Write-Info "画像ファイルをアップロード..."
scp -r images/* "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/images/"
Write-Success "画像アップロード完了"

# sudoでファイルを本来の場所にコピー
Write-Info "ファイルを本来の場所にコピー (sudo使用)..."
ssh "${SERVER_USER}@${SERVER_HOST}" @"
sudo cp -r ${TEMP_PATH}/* ${SERVER_PATH}/
sudo chown -R wwwrun:www ${SERVER_PATH}/*
sudo chmod -R 644 ${SERVER_PATH}/*
sudo find ${SERVER_PATH} -type d -exec chmod 755 {} \;
rm -rf ${TEMP_PATH}
echo 'ファイルコピーと権限設定完了'
"@

if ($LASTEXITCODE -eq 0) {
    Write-Success "ファイル配置完了"
} else {
    Write-Error "ファイル配置でエラーが発生しました"
}

Write-Host ""
Write-Host "🎉 アップロード処理完了!" -ForegroundColor Green
Write-Host "🌐 https://aivis-chan-bot.com でアクセス確認してください" -ForegroundColor Cyan
Write-Host ""

# サイトアクセステスト
Write-Info "Webサイトアクセステスト..."
try {
    $response = Invoke-WebRequest -Uri "https://aivis-chan-bot.com" -Method Head -TimeoutSec 10
    Write-Success "Webサイトアクセス確認OK (HTTP $($response.StatusCode))"
} catch {
    Write-Error "Webサイトアクセス確認失敗: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "📝 この方法は一時ディレクトリ経由でファイルをコピーします" -ForegroundColor Yellow
Write-Host "💡 権限問題の根本解決のため、システム管理者にwwwグループ追加を依頼してください" -ForegroundColor Cyan
