# 対話式アップロードスクリプト
# sudoパスワードを手動入力

$SERVER_HOST = "alecjp02.asuscomm.com"
$SERVER_USER = "alec"
$TEMP_PATH = "/home/alec/temp-upload"
$SERVER_PATH = "/srv/www/htdocs"

function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "🔍 $msg" -ForegroundColor Cyan }

Write-Host "🚀 Aivis-chan Bot Website 対話式アップロード" -ForegroundColor Magenta

# ファイル確認
$files = @("index.html", "manifest.json", "sw.js", "offline.html")
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Error "$file が見つかりません"
        exit 1
    }
}
Write-Success "必要ファイルの存在確認完了"

# 手順説明
Write-Host ""
Write-Host "📋 手動実行手順:" -ForegroundColor Yellow
Write-Host "1. まず一時ディレクトリにファイルをアップロード" -ForegroundColor Cyan
Write-Host "2. SSH接続してsudoでファイルを本来の場所にコピー" -ForegroundColor Cyan
Write-Host ""

# ファイルを一時ディレクトリにアップロード
Write-Info "Step 1: 一時ディレクトリにファイルアップロード..."

ssh "${SERVER_USER}@${SERVER_HOST}" "rm -rf ${TEMP_PATH} && mkdir -p ${TEMP_PATH}/{css,js,images}"

scp index.html offline.html "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/"
scp manifest.json sw.js "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/"
scp css/main.css "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/css/"
scp js/main.js "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/js/"
scp -r images/* "${SERVER_USER}@${SERVER_HOST}:${TEMP_PATH}/images/"

Write-Success "一時ディレクトリへのアップロード完了"

Write-Host ""
Write-Host "📝 Step 2: 以下のコマンドをSSH接続先で実行してください:" -ForegroundColor Yellow
Write-Host ""
Write-Host "ssh ${SERVER_USER}@${SERVER_HOST}" -ForegroundColor Green
Write-Host ""
Write-Host "サーバーにログイン後、以下を順番に実行:" -ForegroundColor Cyan
Write-Host "sudo cp -r ${TEMP_PATH}/* ${SERVER_PATH}/" -ForegroundColor White
Write-Host "sudo chown -R wwwrun:www ${SERVER_PATH}/*" -ForegroundColor White  
Write-Host "sudo chmod -R 644 ${SERVER_PATH}/*" -ForegroundColor White
Write-Host "sudo find ${SERVER_PATH} -type d -exec chmod 755 {} \;" -ForegroundColor White
Write-Host "rm -rf ${TEMP_PATH}" -ForegroundColor White
Write-Host "exit" -ForegroundColor White
Write-Host ""

Write-Host "🎯 完了後、以下でアクセス確認:" -ForegroundColor Yellow
Write-Host "https://aivis-chan-bot.com" -ForegroundColor Green
