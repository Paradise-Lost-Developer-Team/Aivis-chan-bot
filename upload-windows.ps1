# Aivis-chan Bot Website アップロードスクリプト (Windows PowerShell版)
# SCP/SSH認証対応版

param(
    [string]$Password = "",
    [switch]$UseKey = $false,
    [string]$KeyPath = ""
)

# サーバー設定
$SERVER_HOST = "alecjp02.asuscomm.com"
$SERVER_USER = "alec"
$SERVER_PATH = "/srv/www/htdocs"

# 色付きメッセージ用関数
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "🔍 $msg" -ForegroundColor Cyan }

Write-Host "🚀 Aivis-chan Bot Website アップロード開始" -ForegroundColor Magenta

# 必要なツールの確認
Write-Info "必要なツールの確認..."
$tools = @("scp", "ssh", "curl")
$missingTools = @()

foreach ($tool in $tools) {
    try {
        $null = Get-Command $tool -ErrorAction Stop
        Write-Success "$tool が利用可能"
    }
    catch {
        $missingTools += $tool
    }
}

if ($missingTools.Count -gt 0) {
    Write-Error "以下のツールが見つかりません: $($missingTools -join ', ')"
    Write-Info "Git for Windows または OpenSSH をインストールしてください"
    Write-Info "または WSL (Windows Subsystem for Linux) を使用してください"
    exit 1
}

# ファイル存在チェック
Write-Info "ファイル存在チェック..."
$required_files = @("index.html", "manifest.json", "sw.js", "offline.html", "css/main.css", "js/main.js")

foreach ($file in $required_files) {
    if (-not (Test-Path $file)) {
        Write-Error "$file が見つかりません"
        exit 1
    }
}

if (-not (Test-Path "images" -PathType Container)) {
    Write-Error "imagesディレクトリが見つかりません"
    exit 1
}

Write-Success "全ファイルの存在を確認"

# 認証方法の選択
if ($UseKey -and $KeyPath) {
    Write-Info "SSH鍵認証を使用: $KeyPath"
    $sshOptions = "-i `"$KeyPath`""
    $scpOptions = "-i `"$KeyPath`""
} elseif ($Password) {
    Write-Info "パスワード認証を使用"
    # sshpassが必要（通常Windowsには含まれていない）
    Write-Warning "Windowsではパスワード認証が制限されています"
    Write-Info "SSH鍵認証の使用を推奨します"
    $sshOptions = ""
} else {
    Write-Warning "認証情報が指定されていません"
    Write-Info "使用方法:"
    Write-Info "  SSH鍵使用: .\upload-windows.ps1 -UseKey -KeyPath `"C:\path\to\private\key`""
    Write-Info "  パスワード: .\upload-windows.ps1 -Password `"your_password`""
    exit 1
}

# リモートディレクトリの準備
Write-Info "サーバー上のディレクトリを準備..."
try {
    if ($UseKey -and $KeyPath) {
        # ディレクトリが既に存在するかチェックし、なければsudoで作成
        & ssh $sshOptions "${SERVER_USER}@${SERVER_HOST}" "sudo mkdir -p ${SERVER_PATH}/{css,js,images} && sudo chown -R wwwrun:www ${SERVER_PATH} && sudo chmod -R 775 ${SERVER_PATH}"
    } else {
        & ssh "${SERVER_USER}@${SERVER_HOST}" "sudo mkdir -p ${SERVER_PATH}/{css,js,images} && sudo chown -R wwwrun:www ${SERVER_PATH} && sudo chmod -R 775 ${SERVER_PATH}"
    }
    
    if ($LASTEXITCODE -ne 0) {
        throw "SSH接続エラー"
    }
    Write-Success "サーバー接続OK"
}
catch {
    Write-Error "サーバー接続に失敗しました: $($_.Exception.Message)"
    Write-Info "接続トラブルシューティング:"
    Write-Info "1. SSH鍵が正しく設定されているか確認"
    Write-Info "2. サーバーのSSH設定を確認"
    Write-Info "3. ファイアウォール設定を確認"
    exit 1
}

# ファイルアップロード関数
function Upload-Files {
    param($files, $destination, $description)
    
    Write-Info "$description のアップロード..."
    
    foreach ($file in $files) {
        try {
            if ($UseKey -and $KeyPath) {
                & scp $scpOptions $file "${SERVER_USER}@${SERVER_HOST}:${destination}"
            } else {
                & scp $file "${SERVER_USER}@${SERVER_HOST}:${destination}"
            }
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "$file アップロード完了"
            } else {
                throw "アップロードエラー"
            }
        }
        catch {
            Write-Error "$file アップロード失敗"
            return $false
        }
    }
    return $true
}

# ファイルアップロード実行
$uploadSuccess = $true

# HTMLファイル
$uploadSuccess = $uploadSuccess -and (Upload-Files @("index.html", "offline.html") "$SERVER_PATH/" "HTMLファイル")

# PWAファイル
$uploadSuccess = $uploadSuccess -and (Upload-Files @("manifest.json", "sw.js") "$SERVER_PATH/" "PWAファイル")

# CSS/JSファイル
$uploadSuccess = $uploadSuccess -and (Upload-Files @("css/main.css") "$SERVER_PATH/css/" "CSSファイル")
$uploadSuccess = $uploadSuccess -and (Upload-Files @("js/main.js") "$SERVER_PATH/js/" "JSファイル")

# 画像ファイル
Write-Info "画像ファイルのアップロード..."
try {
    if ($UseKey -and $KeyPath) {
        & scp $scpOptions -r "images/*" "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/images/"
    } else {
        & scp -r "images/*" "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/images/"
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "画像ファイル アップロード完了"
    } else {
        Write-Warning "画像ファイル アップロードに問題がある可能性があります"
    }
}
catch {
    Write-Warning "画像ファイル アップロードでエラーが発生しました"
}

if (-not $uploadSuccess) {
    Write-Error "一部のファイルのアップロードに失敗しました"
    exit 1
}

# ファイル権限設定
Write-Info "ファイル権限を設定..."
try {
    if ($UseKey -and $KeyPath) {
        # 一般ユーザーではsudoが必要
        & ssh $sshOptions "${SERVER_USER}@${SERVER_HOST}" "sudo chown -R wwwrun:www ${SERVER_PATH} && sudo chmod -R 644 ${SERVER_PATH}/* && sudo find ${SERVER_PATH} -type d -exec chmod 755 {} \;"
    } else {
        & ssh "${SERVER_USER}@${SERVER_HOST}" "sudo chown -R wwwrun:www ${SERVER_PATH} && sudo chmod -R 644 ${SERVER_PATH}/* && sudo find ${SERVER_PATH} -type d -exec chmod 755 {} \;"
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "ファイル権限設定完了"
    } else {
        Write-Warning "ファイル権限設定に問題がある可能性があります"
    }
}
catch {
    Write-Warning "ファイル権限設定でエラーが発生しました"
}

# Apache設定の確認・リロード
Write-Info "Apache設定を確認..."
try {
    if ($UseKey -and $KeyPath) {
        & ssh $sshOptions "${SERVER_USER}@${SERVER_HOST}" "sudo systemctl reload apache2"
    } else {
        & ssh "${SERVER_USER}@${SERVER_HOST}" "sudo systemctl reload apache2"
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Apache リロード完了"
    } else {
        Write-Warning "Apache リロードに問題がある可能性があります"
    }
}
catch {
    Write-Warning "Apache リロードでエラーが発生しました"
}

# アップロード確認
Write-Info "Webサイトアクセス確認..."
try {
    $response = Invoke-WebRequest -Uri "https://aivis-chan-bot.com" -Method Head -TimeoutSec 10
    $statusCode = $response.StatusCode
    
    if ($statusCode -eq 200) {
        Write-Success "Webサイトアクセス確認OK (HTTP $statusCode)"
    } else {
        Write-Warning "Webサイトアクセス: HTTP $statusCode"
    }
}
catch {
    Write-Warning "Webサイトアクセス確認失敗: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "🎉 アップロード完了!" -ForegroundColor Green
Write-Host "🌐 https://aivis-chan-bot.com でアクセス可能です" -ForegroundColor Cyan
Write-Host ""

# デプロイログの記録
$logEntry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Deploy completed - Files: $($required_files -join ', ')"
Add-Content -Path "deploy.log" -Value $logEntry
Write-Info "デプロイログを deploy.log に記録しました"
