# 簡易アップロードスクリプト (権限問題回避版)

param(
    [string]$KeyPath = "$env:USERPROFILE\.ssh\id_rsa_aivis"
)

$SERVER_HOST = "alecjp02.asuscomm.com"
$SERVER_USER = "alec"
$SERVER_PATH = "/srv/www/htdocs/aivis-chan-bot.com"

# 色付きメッセージ用関数
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "🔍 $msg" -ForegroundColor Cyan }

Write-Host "🚀 Aivis-chan Bot Website 簡易アップロード" -ForegroundColor Magenta

# SSH鍵ファイル確認
if (-not (Test-Path $KeyPath)) {
    Write-Error "SSH鍵ファイルが見つかりません: $KeyPath"
    exit 1
}

Write-Success "SSH鍵ファイル確認OK: $KeyPath"

# SSH設定確認
Write-Info "SSH接続テスト..."
try {
    $testResult = ssh -o BatchMode=yes -o ConnectTimeout=5 -i $KeyPath "${SERVER_USER}@${SERVER_HOST}" "echo 'test'"
    if ($LASTEXITCODE -eq 0) {
        Write-Success "SSH接続OK (パスワードなし)"
    } else {
        Write-Info "SSH接続にはパスワードが必要です"
    }
} catch {
    Write-Info "SSH接続テスト中にエラーが発生しました"
}

# ファイル確認
$files = @("index.html", "manifest.json", "sw.js", "offline.html")
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Error "$file が見つかりません"
        exit 1
    }
}
Write-Success "必要ファイルの存在確認完了"

# ファイルアップロード
Write-Info "ファイルアップロード開始..."

# HTMLファイル
Write-Info "HTMLファイルをアップロード..."
scp -i $KeyPath index.html offline.html "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
if ($LASTEXITCODE -eq 0) { Write-Success "HTML完了" } else { Write-Error "HTML失敗" }

# PWAファイル
Write-Info "PWAファイルをアップロード..."
scp -i $KeyPath manifest.json sw.js "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
if ($LASTEXITCODE -eq 0) { Write-Success "PWA完了" } else { Write-Error "PWA失敗" }

# CSS
Write-Info "CSSファイルをアップロード..."
scp -i $KeyPath css/main.css "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/css/"
if ($LASTEXITCODE -eq 0) { Write-Success "CSS完了" } else { Write-Error "CSS失敗" }

# JS
Write-Info "JSファイルをアップロード..."
scp -i $KeyPath js/main.js "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/js/"
if ($LASTEXITCODE -eq 0) { Write-Success "JS完了" } else { Write-Error "JS失敗" }

# 画像 (エラーを無視)
Write-Info "画像ファイルをアップロード..."
scp -i $KeyPath -r images/* "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/images/" 2>$null
Write-Success "画像アップロード試行完了"

# 権限修正（可能であれば）
Write-Info "権限修正を試行..."
ssh -i $KeyPath "${SERVER_USER}@${SERVER_HOST}" "sudo chown -R wwwrun:www ${SERVER_PATH} 2>/dev/null || echo '権限修正は手動で実行してください'"

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
