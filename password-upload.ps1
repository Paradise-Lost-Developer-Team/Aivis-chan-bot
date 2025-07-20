# パスワード認証版アップロードスクリプト
# SSH鍵認証の問題を回避

$SERVER_HOST = "alecjp02.asuscomm.com"
$SERVER_USER = "alec"
$SERVER_PATH = "/srv/www/htdocs/aivis-chan-bot.com"

function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "🔍 $msg" -ForegroundColor Cyan }

Write-Host "🚀 Aivis-chan Bot Website アップロード (パスワード認証版)" -ForegroundColor Magenta
Write-Host "⚠️  SSH接続時にパスワードの入力が必要です" -ForegroundColor Yellow

# ファイル確認
$files = @("index.html", "manifest.json", "sw.js", "offline.html")
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Error "$file が見つかりません"
        exit 1
    }
}
Write-Success "必要ファイルの存在確認完了"

# ディレクトリ確認・作成
Write-Info "サーバー上のディレクトリを確認..."
ssh "${SERVER_USER}@${SERVER_HOST}" "ls -la ${SERVER_PATH}/ && echo 'ディレクトリ確認完了'"

# ファイルアップロード
Write-Info "ファイルアップロード開始 (各ファイルごとにパスワード入力が必要)..."

# HTMLファイル
Write-Info "HTMLファイルをアップロード..."
scp index.html offline.html "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
if ($LASTEXITCODE -eq 0) { Write-Success "HTML完了" } else { Write-Error "HTML失敗" }

# PWAファイル
Write-Info "PWAファイルをアップロード..."
scp manifest.json sw.js "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"
if ($LASTEXITCODE -eq 0) { Write-Success "PWA完了" } else { Write-Error "PWA失敗" }

# CSS
Write-Info "CSSファイルをアップロード..."
scp css/main.css "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/css/"
if ($LASTEXITCODE -eq 0) { Write-Success "CSS完了" } else { Write-Error "CSS失敗" }

# JS
Write-Info "JSファイルをアップロード..."
scp js/main.js "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/js/"
if ($LASTEXITCODE -eq 0) { Write-Success "JS完了" } else { Write-Error "JS失敗" }

# 画像
Write-Info "画像ファイルをアップロード..."
scp -r images/* "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/images/"
Write-Success "画像アップロード完了"

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
Write-Host "📝 注意: SSH鍵認証の問題により、パスワード認証を使用しました" -ForegroundColor Yellow
Write-Host "💡 今後はGitリポジトリへのプッシュ後、サーバー側でpullする方法も検討してください" -ForegroundColor Cyan
