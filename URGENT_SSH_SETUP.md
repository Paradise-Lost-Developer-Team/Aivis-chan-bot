# 🔧 SSH Root無効化 - 緊急対応手順

## 📋 現在の状況
- SSH root アクセスが禁止されている
- `alec` ユーザーでの接続が必要
- SSH鍵認証がまだ設定されていない

## 🚀 即座に実行すべき手順

### 1. alecユーザーでパスワード認証接続

コマンドプロンプトまたはPowerShellで以下を実行：

```cmd
ssh alec@alecjp02.asuscomm.com
```

**パスワードを入力してログイン**

### 2. サーバー側でSSH鍵設定

alecユーザーでログイン後、以下を実行：

```bash
# SSH設定ディレクトリを作成
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 公開鍵を追加（1行で実行）
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDSkTeJO5xxTT7MFZxnO3QV6VwDAc14mCPDJtBvAgCJfEr8yV6xivIm9l3VeojGXs1tIKQFUEn9wh+e6z37trQyETDmxHbdyyDDqzk8Wp8PbybHCxpq3Ir0YKSAghcTIZ4msa6BQMFYPOZwSdmo85clkDMnXJxoykrzKepJdb1Dh7N5b8+bRs4hFNyW/8V1crKHQaVIOYe4ZFNMP5ebng9raVpD7lpLYIx+aa9UYLll6fcC/pZdsmeG9D+6ykKQk4Sh4PZO5tZjV9Ustd7/kLbaLsPRJgHFbdlnQzqR6ZY4zX7Pwj1PUL9OlqL8ZpIF6h3pdNMYSucn4ZYG3AvbObiXXD7zwqfH/BH1h4SmY+YEDoamVmrrxhjum65X1D0e9RmsCFTGDgTYjRTeX3c5kdhvGSEp21RkglaCF/mHNreBjtwOeLD5LLYRCNvvkfVAB+slsmJjrrv+5auUW3vUdPMDeoq1Q/bJWVxHuxXLrRRNnjD7P+ioj86dCTAAcJrPl+v2qG0zfEm2ezAyre02dCbY2vdeucPkwwxSJ3oG5w70crG8gH9UOUER1YRTImyx0VqpbpuEEVhThzVunTSebxvJQgzjaDqKNUVpWEKwQNwrRlBaYgkDefiY0MhbupeRzcWWPKDDJVTWOCtlAc/MceuFSaCCDSTQehDtqJkug0BOm9uzPYQ== uketp@Alec-PC-2022" >> ~/.ssh/authorized_keys

# ファイル権限を設定
chmod 600 ~/.ssh/authorized_keys

# 設定確認
ls -la ~/.ssh/
```

### 3. sudo権限の確認

```bash
# sudoグループ所属確認
groups

# sudo権限テスト
sudo -l
```

### 4. Webディレクトリアクセス確認

```bash
# Webディレクトリの存在確認
ls -la /srv/www/htdocs/

# 権限確認
ls -la /srv/www/htdocs/aivis-chan-bot.com/

# 書き込み権限テスト
touch /srv/www/htdocs/aivis-chan-bot.com/test.txt
```

### 5. SSH接続を終了

```bash
exit
```

## ✅ SSH鍵認証テスト

Windows PowerShellで以下を実行：

```powershell
# SSH鍵認証でログインテスト
ssh -i "$env:USERPROFILE\.ssh\id_rsa_aivis" alec@alecjp02.asuscomm.com "echo 'SSH鍵認証成功'"
```

## 🚀 アップロードテスト

SSH鍵認証が成功したら：

```powershell
# アップロードスクリプト実行
.\upload-windows.ps1 -UseKey -KeyPath "$env:USERPROFILE\.ssh\id_rsa_aivis"
```

## 🔧 権限エラーが発生した場合

### sudo権限が無い場合
システム管理者に連絡して以下を依頼：

```bash
# root権限で実行
usermod -aG sudo alec
# または openSUSEの場合
usermod -aG wheel alec
```

### Webディレクトリ書き込み権限が無い場合

#### 一時的解決策
```bash
sudo chmod 777 /srv/www/htdocs/aivis-chan-bot.com
```

#### 永続的解決策
```bash
# alecユーザーをwwwグループに追加
sudo usermod -aG www alec

# ディレクトリ権限設定
sudo chown -R wwwrun:www /srv/www/htdocs/aivis-chan-bot.com
sudo chmod -R 775 /srv/www/htdocs/aivis-chan-bot.com
sudo chmod g+s /srv/www/htdocs/aivis-chan-bot.com
```

## 📝 チェックリスト

- [ ] alecユーザーでパスワード認証ログイン
- [ ] SSH公開鍵をauthorized_keysに追加
- [ ] SSH鍵認証でのログインテスト成功
- [ ] sudo権限の確認
- [ ] Webディレクトリへの書き込み権限確認
- [ ] アップロードスクリプトの実行テスト
- [ ] Webサイトアクセス確認

この手順に従って設定すれば、root権限なしでWebサイトの更新が可能になります。
