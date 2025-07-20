# 一般ユーザーでのサーバー設定ガイド

## 🔧 SSH root無効化環境での対応

### 現在の問題
- SSH root アクセスが禁止されている
- `alec` ユーザーでの接続が必要
- Webサーバーディレクトリへの書き込み権限が必要

## 📋 解決手順

### 1. alecユーザーでのSSH接続設定

#### SSH公開鍵を設定
```bash
# alecユーザーでサーバーに接続
ssh alec@alecjp02.asuscomm.com

# SSH設定ディレクトリを作成
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 公開鍵を追加
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDSkTeJO5xxTT7MFZxnO3QV6VwDAc14mCPDJtBvAgCJfEr8yV6xivIm9l3VeojGXs1tIKQFUEn9wh+e6z37trQyETDmxHbdyyDDqzk8Wp8PbybHCxpq3Ir0YKSAghcTIZ4msa6BQMFYPOZwSdmo85clkDMnXJxoykrzKepJdb1Dh7N5b8+bRs4hFNyW/8V1crKHQaVIOYe4ZFNMP5ebng9raVpD7lpLYIx+aa9UYLll6fcC/pZdsmeG9D+6ykKQk4Sh4PZO5tZjV9Ustd7/kLbaLsPRJgHFbdlnQzqR6ZY4zX7Pwj1PUL9OlqL8ZpIF6h3pdNMYSucn4ZYG3AvbObiXXD7zwqfH/BH1h4SmY+YEDoamVmrrxhjum65X1D0e9RmsCFTGDgTYjRTeX3c5kdhvGSEp21RkglaCF/mHNreBjtwOeLD5LLYRCNvvkfVAB+slsmJjrrv+5auUW3vUdPMDeoq1Q/bJWVxHuxXLrRRNnjD7P+ioj86dCTAAcJrPl+v2qG0zfEm2ezAyre02dCbY2vdeucPkwwxSJ3oG5w70crG8gH9UOUER1YRTImyx0VqpbpuEEVhThzVunTSebxvJQgzjaDqKNUVpWEKwQNwrRlBaYgkDefiY0MhbupeRzcWWPKDDJVTWOCtlAc/MceuFSaCCDSTQehDtqJkug0BOm9uzPYQ== uketp@Alec-PC-2022" >> ~/.ssh/authorized_keys

# ファイル権限を設定
chmod 600 ~/.ssh/authorized_keys
```

### 2. sudoアクセスの確認と設定

#### sudoアクセスの確認
```bash
# alecユーザーがsudoグループに所属しているか確認
groups alec

# sudoコマンドが使用可能か確認
sudo -l
```

#### sudoアクセスが無い場合の対応
システム管理者に以下を依頼：

```bash
# root権限で実行
usermod -aG sudo alec
# または
usermod -aG wheel alec  # openSUSEの場合

# sudoersファイルの編集
visudo
# 以下を追加:
# alec ALL=(ALL) NOPASSWD: /bin/chown, /bin/chmod, /usr/sbin/systemctl
```

### 3. Webサーバーディレクトリの権限設定

#### 方法A: alecユーザーを www グループに追加
```bash
# システム管理者に依頼
sudo usermod -aG www alec

# Webディレクトリの所有者をwwwグループに設定
sudo chown -R wwwrun:www /srv/www/htdocs/aivis-chan-bot.com
sudo chmod -R 775 /srv/www/htdocs/aivis-chan-bot.com

# 新しいファイルが適切な権限で作成されるよう設定
sudo chmod g+s /srv/www/htdocs/aivis-chan-bot.com
```

#### 方法B: alecユーザー専用ディレクトリを作成
```bash
# alecユーザーのホームディレクトリにWebサイト用ディレクトリを作成
mkdir -p /home/alec/website
chmod 755 /home/alec/website

# Apache設定でDocumentRootを変更
sudo nano /etc/apache2/sites-available/aivis-chan-bot.com.conf
# DocumentRoot を /home/alec/website に変更

# Apacheを再起動
sudo systemctl reload apache2
```

### 4. アップロードスクリプトの修正済み設定

#### PowerShellスクリプト使用
```powershell
# SSH鍵認証でアップロード
.\upload-windows.ps1 -UseKey -KeyPath "$env:USERPROFILE\.ssh\id_rsa_aivis"
```

#### Bashスクリプト使用
```bash
./upload.sh
```

### 5. 権限問題の解決スクリプト

#### サーバー側権限修正スクリプト作成
```bash
# fix-permissions.sh を /home/alec/ に作成
cat > /home/alec/fix-permissions.sh << 'EOF'
#!/bin/bash
# Webサイトファイルの権限を修正

WEBSITE_DIR="/srv/www/htdocs/aivis-chan-bot.com"

# ファイル所有者をwwwrun:wwwに設定
sudo chown -R wwwrun:www "$WEBSITE_DIR"

# ディレクトリ権限を755に設定
find "$WEBSITE_DIR" -type d -exec sudo chmod 755 {} \;

# ファイル権限を644に設定
find "$WEBSITE_DIR" -type f -exec sudo chmod 644 {} \;

echo "権限修正完了"
EOF

chmod +x /home/alec/fix-permissions.sh
```

#### Windows側からリモート実行
```powershell
# アップロード後に権限修正を実行
ssh -i "$env:USERPROFILE\.ssh\id_rsa_aivis" alec@alecjp02.asuscomm.com "/home/alec/fix-permissions.sh"
```

## 🔄 更新されたワークフロー

### 1. ファイル更新・アップロード
```powershell
# Windows PowerShellで実行
.\upload-windows.ps1 -UseKey -KeyPath "$env:USERPROFILE\.ssh\id_rsa_aivis"
```

### 2. 権限修正
```powershell
# リモートで権限修正実行
ssh -i "$env:USERPROFILE\.ssh\id_rsa_aivis" alec@alecjp02.asuscomm.com "/home/alec/fix-permissions.sh"
```

### 3. Apache再起動（必要に応じて）
```powershell
# Apache設定リロード
ssh -i "$env:USERPROFILE\.ssh\id_rsa_aivis" alec@alecjp02.asuscomm.com "sudo systemctl reload apache2"
```

### 4. 動作確認
```powershell
# Webサイトアクセス確認
Invoke-WebRequest -Uri "https://aivis-chan-bot.com" -Method Head
```

## 🚨 トラブルシューティング

### sudo権限が無い場合
```bash
# システム管理者に以下を依頼
su -c "usermod -aG sudo alec"
# または
su -c "usermod -aG wheel alec"
```

### Webディレクトリ書き込み権限が無い場合
```bash
# 一時的な解決策
sudo chmod 777 /srv/www/htdocs/aivis-chan-bot.com
# アップロード後
sudo chmod 755 /srv/www/htdocs/aivis-chan-bot.com
```

### Apache設定権限エラー
```bash
# Apache設定ファイルの確認
sudo apache2ctl configtest

# エラーログの確認
sudo tail -f /var/log/apache2/error.log
```

この設定により、root権限なしでWebサイトの更新が可能になります。
