# SSH認証設定ガイド - Windows版

## 🔑 SSH鍵認証の設定手順

### 1. SSH鍵ペアの生成

PowerShellで以下を実行：

```powershell
# SSH鍵ペアを生成
ssh-keygen -t rsa -b 4096 -f "$env:USERPROFILE\.ssh\id_rsa_aivis" -N '""'
```

### 2. 公開鍵をサーバーにコピー

#### 方法A: ssh-copy-idを使用（推奨）
```powershell
# 公開鍵をサーバーにコピー
ssh-copy-id -i "$env:USERPROFILE\.ssh\id_rsa_aivis.pub" root@alecjp02.asuscomm.com
```

#### 方法B: 手動でコピー
```powershell
# 公開鍵の内容を表示
Get-Content "$env:USERPROFILE\.ssh\id_rsa_aivis.pub"

# サーバーにSSH接続して手動で設定
ssh root@alecjp02.asuscomm.com
mkdir -p ~/.ssh
echo "公開鍵の内容をここに貼り付け" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
exit
```

### 3. SSH設定ファイルの作成

`$env:USERPROFILE\.ssh\config` ファイルを作成：

```
Host aivis-server
    HostName alecjp02.asuscomm.com
    User root
    IdentityFile ~/.ssh/id_rsa_aivis
    IdentitiesOnly yes
```

### 4. 接続テスト

```powershell
# SSH接続テスト
ssh aivis-server

# またはフルパス指定
ssh -i "$env:USERPROFILE\.ssh\id_rsa_aivis" root@alecjp02.asuscomm.com
```

## 🚀 アップロードスクリプトの使用方法

### SSH鍵認証で実行
```powershell
# SSH設定ファイルを使用
.\upload-windows.ps1 -UseKey -KeyPath "$env:USERPROFILE\.ssh\id_rsa_aivis"

# または設定ファイル名を使用
ssh aivis-server
```

### パスワード認証の場合
```powershell
# パスワード認証（非推奨）
.\upload-windows.ps1 -Password "your_password"
```

## 🔧 トラブルシューティング

### SSH接続エラーの場合

1. **OpenSSHの確認**
```powershell
# OpenSSHクライアントの確認
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*'

# インストールが必要な場合
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

2. **Git Bashを使用**
```bash
# Git Bashから実行
./upload.sh
```

3. **WSL (Windows Subsystem for Linux) を使用**
```bash
# WSLから実行
wsl ./upload.sh
```

### ファイアウォールエラーの場合

```powershell
# SSH接続テスト
Test-NetConnection -ComputerName alecjp02.asuscomm.com -Port 22
```

### 権限エラーの場合

```powershell
# SSH鍵の権限を修正
icacls "$env:USERPROFILE\.ssh\id_rsa_aivis" /inheritance:r
icacls "$env:USERPROFILE\.ssh\id_rsa_aivis" /grant:r "$env:USERNAME:(R)"
```

## 📝 代替案

### 1. WinSCPを使用
- GUI でファイル転送
- https://winscp.net/

### 2. PuTTY + PSCPを使用
- PuTTYツールセット
- https://www.putty.org/

### 3. Visual Studio Code拡張機能
- SFTP拡張機能を使用
- リアルタイム同期

## ✅ 設定完了後の確認

```powershell
# 1. SSH接続確認
ssh aivis-server "echo 'SSH接続OK'"

# 2. アップロードテスト
.\upload-windows.ps1 -UseKey -KeyPath "$env:USERPROFILE\.ssh\id_rsa_aivis"

# 3. Webサイト確認
Start-Process "https://aivis-chan-bot.com"
```
