# Aivis-chan Bot Website クイック更新スクリプト
# 特定のファイルのみを高速更新

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("html", "css", "js", "all", "pwa")]
    [string]$UpdateType,
    
    [string]$ServerHost = "alecjp02.asuscomm.com",
    [string]$ServerUser = "root",
    [string]$ServerPath = "/srv/www/htdocs/aivis-chan-bot.com"
)

Write-Host "🚀 Aivis-chan Bot Website クイック更新" -ForegroundColor Green

# 更新タイプに応じたファイル選択
switch ($UpdateType) {
    "html" {
        $FilesToUpdate = @("index.html", "offline.html")
        Write-Host "📄 HTMLファイルを更新します" -ForegroundColor Yellow
    }
    "css" {
        $FilesToUpdate = @("css/main.css")
        Write-Host "🎨 CSSファイルを更新します" -ForegroundColor Yellow
    }
    "js" {
        $FilesToUpdate = @("js/main.js")
        Write-Host "⚡ JavaScriptファイルを更新します" -ForegroundColor Yellow
    }
    "pwa" {
        $FilesToUpdate = @("manifest.json", "sw.js")
        Write-Host "📱 PWAファイルを更新します" -ForegroundColor Yellow
    }
    "all" {
        $FilesToUpdate = @("index.html", "offline.html", "css/main.css", "js/main.js", "manifest.json", "sw.js")
        Write-Host "🔄 全ファイルを更新します" -ForegroundColor Yellow
    }
}

# ファイル存在確認
foreach ($file in $FilesToUpdate) {
    if (!(Test-Path $file)) {
        Write-Host "❌ $file が見つかりません" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ 全ファイルの存在を確認" -ForegroundColor Green

# SCP を使用した高速アップロード
Write-Host "📡 ファイルをアップロード中..." -ForegroundColor Yellow

foreach ($file in $FilesToUpdate) {
    $remoteDir = if ($file.Contains("/")) { 
        $serverPath + "/" + [System.IO.Path]::GetDirectoryName($file).Replace("\", "/")
    } else { 
        $serverPath 
    }
    
    $scpCommand = "scp `"$file`" ${ServerUser}@${ServerHost}:${remoteDir}/"
    
    Write-Host "  🔄 $file をアップロード中..." -ForegroundColor Gray
    
    try {
        # PowerShell で SCP 実行（WSL または Git Bash 経由）
        if (Get-Command "wsl" -ErrorAction SilentlyContinue) {
            $wslPath = $file -replace "\\", "/" -replace "^([A-Z]):", "/mnt/$($matches[1].ToLower())"
            wsl scp $wslPath ${ServerUser}@${ServerHost}:${remoteDir}/
        } elseif (Get-Command "bash" -ErrorAction SilentlyContinue) {
            bash -c $scpCommand
        } else {
            Write-Host "❌ SCP実行環境が見つかりません（WSL または Git Bash が必要）" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "  ✅ $file アップロード完了" -ForegroundColor Green
        
    } catch {
        Write-Host "  ❌ $file アップロード失敗: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Apache リロード
Write-Host "🔄 Apache設定をリロード中..." -ForegroundColor Yellow
try {
    if (Get-Command "wsl" -ErrorAction SilentlyContinue) {
        wsl ssh ${ServerUser}@${ServerHost} "systemctl reload apache2"
    } elseif (Get-Command "bash" -ErrorAction SilentlyContinue) {
        bash -c "ssh ${ServerUser}@${ServerHost} 'systemctl reload apache2'"
    }
    Write-Host "✅ Apache リロード完了" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Apache リロードに失敗しました" -ForegroundColor Yellow
}

# 更新確認
Write-Host "🔍 更新確認中..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://aivis-chan-bot.com" -Method Head -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Webサイトアクセス確認OK" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Webサイトアクセス確認失敗（キャッシュクリアが必要な可能性があります）" -ForegroundColor Yellow
}

Write-Host "🎉 クイック更新完了!" -ForegroundColor Green
Write-Host "🌐 https://aivis-chan-bot.com で確認してください" -ForegroundColor Cyan

# 使用例の表示
Write-Host ""
Write-Host "📝 使用例:" -ForegroundColor Gray
Write-Host "   .\quick-update.ps1 -UpdateType html    # HTMLのみ更新" -ForegroundColor Gray
Write-Host "   .\quick-update.ps1 -UpdateType css     # CSSのみ更新" -ForegroundColor Gray  
Write-Host "   .\quick-update.ps1 -UpdateType js      # JavaScriptのみ更新" -ForegroundColor Gray
Write-Host "   .\quick-update.ps1 -UpdateType pwa     # PWAファイルのみ更新" -ForegroundColor Gray
Write-Host "   .\quick-update.ps1 -UpdateType all     # 全ファイル更新" -ForegroundColor Gray
