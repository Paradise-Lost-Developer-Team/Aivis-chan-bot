# SSH公開鍵をサーバーに設定する手順

## 🔑 公開鍵の内容
以下の公開鍵をサーバーにコピーしてください：

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDSkTeJO5xxTT7MFZxnO3QV6VwDAc14mCPDJtBvAgCJfEr8yV6xivIm9l3VeojGXs1tIKQFUEn9wh+e6z37trQyETDmxHbdyyDDqzk8Wp8PbybHCxpq3Ir0YKSAghcTIZ4msa6BQMFYPOZwSdmo85clkDMnXJxoykrzKepJdb1Dh7N5b8+bRs4hFNyW/8V1crKHQaVIOYe4ZFNMP5ebng9raVpD7lpLYIx+aa9UYLll6fcC/pZdsmeG9D+6ykKQk4Sh4PZO5tZjV9Ustd7/kLbaLsPRJgHFbdlnQzqR6ZY4zX7Pwj1PUL9OlqL8ZpIF6h3pdNMYSucn4ZYG3AvbObiXXD7zwqfH/BH1h4SmY+YEDoamVmrrxhjum65X1D0e9RmsCFTGDgTYjRTeX3c5kdhvGSEp21RkglaCF/mHNreBjtwOeLD5LLYRCNvvkfVAB+slsmJjrrv+5auUW3vUdPMDeoq1Q/bJWVxHuxXLrRRNnjD7P+ioj86dCTAAcJrPl+v2qG0zfEm2ezAyre02dCbY2vdeucPkwwxSJ3oG5w70crG8gH9UOUER1YRTImyx0VqpbpuEEVhThzVunTSebxvJQgzjaDqKNUVpWEKwQNwrRlBaYgkDefiY0MhbupeRzcWWPKDDJVTWOCtlAc/MceuFSaCCDSTQehDtqJkug0BOm9uzPYQ== uketp@Alec-PC-2022
```

## 📋 サーバーでの設定手順

### 1. サーバーにSSH接続（パスワード認証）
```bash
ssh alec@alecjp02.asuscomm.com
```

### 2. SSH設定ディレクトリを作成
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

### 3. 公開鍵を追加
```bash
# authorized_keysファイルに公開鍵を追加
echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDSkTeJO5xxTT7MFZxnO3QV6VwDAc14mCPDJtBvAgCJfEr8yV6xivIm9l3VeojGXs1tIKQFUEn9wh+e6z37trQyETDmxHbdyyDDqzk8Wp8PbybHCxpq3Ir0YKSAghcTIZ4msa6BQMFYPOZwSdmo85clkDMnXJxoykrzKepJdb1Dh7N5b8+bRs4hFNyW/8V1crKHQaVIOYe4ZFNMP5ebng9raVpD7lpLYIx+aa9UYLll6fcC/pZdsmeG9D+6ykKQk4Sh4PZO5tZjV9Ustd7/kLbaLsPRJgHFbdlnQzqR6ZY4zX7Pwj1PUL9OlqL8ZpIF6h3pdNMYSucn4ZYG3AvbObiXXD7zwqfH/BH1h4SmY+YEDoamVmrrxhjum65X1D0e9RmsCFTGDgTYjRTeX3c5kdhvGSEp21RkglaCF/mHNreBjtwOeLD5LLYRCNvvkfVAB+slsmJjrrv+5auUW3vUdPMDeoq1Q/bJWVxHuxXLrRRNnjD7P+ioj86dCTAAcJrPl+v2qG0zfEm2ezAyre02dCbY2vdeucPkwwxSJ3oG5w70crG8gH9UOUER1YRTImyx0VqpbpuEEVhThzVunTSebxvJQgzjaDqKNUVpWEKwQNwrRlBaYgkDefiY0MhbupeRzcWWPKDDJVTWOCtlAc/MceuFSaCCDSTQehDtqJkug0BOm9uzPYQ== uketp@Alec-PC-2022" >> ~/.ssh/authorized_keys
```

### 4. ファイル権限を設定
```bash
chmod 600 ~/.ssh/authorized_keys
```

### 5. SSH設定の確認
```bash
# SSH設定ファイルを確認
cat /etc/ssh/sshd_config | grep -E "(PubkeyAuthentication|AuthorizedKeysFile)"

# SSH サービスを再起動（必要に応じて）
systemctl restart sshd
```

### 6. 接続を終了
```bash
exit
```

## ✅ 設定完了後のテスト

Windows PowerShellで以下を実行してSSH鍵認証をテスト：

```powershell
# SSH鍵認証でのログインテスト
ssh -i "$env:USERPROFILE\.ssh\id_rsa_aivis" alec@alecjp02.asuscomm.com

# 成功したら、アップロードスクリプトを実行
.\upload-windows.ps1 -UseKey -KeyPath "$env:USERPROFILE\.ssh\id_rsa_aivis"
```

## 🔄 次のステップ

1. 上記の手順でサーバーに公開鍵を設定
2. SSH鍵認証をテスト
3. WindowsのPowerShellアップロードスクリプトを実行
4. Webサイトの動作確認

サーバーでの作業が完了したら、このファイルの指示に従ってアップロードスクリプトを実行してください。
