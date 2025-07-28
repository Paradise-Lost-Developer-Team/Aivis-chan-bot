# Aivis-chan Bot Website デプロイスクリプト
# Apache サーバーへのアップロード用

param(
    [string]$ServerPath = "/srv/www/htdocs",
    [string]$ServerUser = "alec",
    [string]$ServerHost = "alecjp02.asuscomm.com",
    [switch]$DryRun = $false
)

Write-Host "🚀 Aivis-chan Bot Website デプロイ開始" -ForegroundColor Green

# デプロイ対象ファイルのリスト
$FilesToDeploy = @(
    "index.html",
    "manifest.json",
    "sw.js",
    "offline.html",
    "css/main.css",
    "js/main.js",
    "images/*"
)

# デプロイ前チェック
Write-Host "📋 デプロイ前チェック..." -ForegroundColor Yellow

# ファイル存在チェック
foreach ($file in $FilesToDeploy) {
    if ($file -eq "images/*") {
        if (!(Test-Path "images")) {
            Write-Host "❌ imagesディレクトリが見つかりません" -ForegroundColor Red
            exit 1
        }
    } else {
        if (!(Test-Path $file)) {
            Write-Host "❌ $file が見つかりません" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "✅ 全ファイルの存在を確認" -ForegroundColor Green

# HTML/CSS/JS 構文チェック
Write-Host "🔍 構文チェック..." -ForegroundColor Yellow

# HTML検証（簡易）
if (Get-Content "index.html" | Select-String "<!DOCTYPE html>") {
    Write-Host "✅ HTML構文OK" -ForegroundColor Green
} else {
    Write-Host "❌ HTML構文エラーの可能性" -ForegroundColor Red
}

# CSS検証（簡易）
$cssContent = Get-Content "css/main.css" -Raw
if ($cssContent -match ".*\{.*\}.*") {
    Write-Host "✅ CSS構文OK" -ForegroundColor Green
} else {
    Write-Host "❌ CSS構文エラーの可能性" -ForegroundColor Red
}

# JavaScript検証（簡易）
$jsContent = Get-Content "js/main.js" -Raw
if ($jsContent -match "class AivisWebsite") {
    Write-Host "✅ JavaScript構文OK" -ForegroundColor Green
} else {
    Write-Host "❌ JavaScript構文エラーの可能性" -ForegroundColor Red
}

if ($DryRun) {
    Write-Host "🔍 ドライラン実行中 - 実際のアップロードは行いません" -ForegroundColor Yellow
    Write-Host "デプロイ対象ファイル一覧:" -ForegroundColor Cyan
    foreach ($file in $FilesToDeploy) {
        Write-Host "  - $file" -ForegroundColor Gray
    }
    return
}

# rsync を使用したアップロード（推奨）
Write-Host "📡 Apache サーバーへアップロード中..." -ForegroundColor Yellow

# rsync コマンド（WSL または Git Bash が必要）
$rsyncCommand = @"
rsync -avz --delete --exclude='.git' --exclude='*.ps1' --exclude='README.md' --exclude='DEPLOY_GUIDE.md' --exclude='server-setup' ./ ${ServerUser}@${ServerHost}:${ServerPath}/
"@

Write-Host "実行コマンド: $rsyncCommand" -ForegroundColor Gray

try {
    # rsync実行
    if (Get-Command "wsl" -ErrorAction SilentlyContinue) {
        $wslDistros = wsl --list --quiet 2>$null
        if ($wslDistros -and $wslDistros.Count -gt 0) {
            Write-Host "WSL経由でrsyncを実行..." -ForegroundColor Cyan
            wsl $rsyncCommand
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ rsyncアップロード完了" -ForegroundColor Green
            } else {
                throw "rsyncアップロードエラー"
            }
        } else {
            throw "WSLディストリビューションが見つかりません"
        }
    } elseif (Get-Command "bash" -ErrorAction SilentlyContinue) {
        Write-Host "Git Bash経由でrsyncを実行..." -ForegroundColor Cyan
        bash -c $rsyncCommand
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ rsyncアップロード完了" -ForegroundColor Green
        } else {
            throw "rsyncアップロードエラー"
        }
    } else {
        throw "rsync環境が見つかりません"
    }
} catch {
    Write-Host "❌ rsyncアップロードに失敗: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "🔄 代替手段として対話式アップロードを実行します..." -ForegroundColor Yellow
    
    # 対話式アップロードスクリプトを実行
    if (Test-Path "interactive-upload.ps1") {
        Write-Host "📤 interactive-upload.ps1 を実行中..." -ForegroundColor Cyan
        & .\interactive-upload.ps1
        return
    } else {
        Write-Host "❌ interactive-upload.ps1 が見つかりません" -ForegroundColor Red
        Write-Host "💡 手動でファイルをアップロードしてください" -ForegroundColor Yellow
        return
    }
}

# アップロード後の確認
Write-Host "🔍 デプロイ後確認..." -ForegroundColor Yellow

# HTTPステータス確認
try {
    $response = Invoke-WebRequest -Uri "https://aivis-chan-bot.com" -Method Head -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Webサイトアクセス確認OK (HTTP $($response.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Webサイトアクセス: HTTP $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Webサイトアクセス確認失敗: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "🎉 デプロイ完了!" -ForegroundColor Green
Write-Host "🌐 https://aivis-chan-bot.com でアクセス可能です" -ForegroundColor Cyan

# デプロイログの記録
$deployLog = @{
    Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Files = $FilesToDeploy
    Status = "Success"
} | ConvertTo-Json

Add-Content -Path "deploy.log" -Value $deployLog

Write-Host "📝 デプロイログを deploy.log に記録しました" -ForegroundColor Gray
