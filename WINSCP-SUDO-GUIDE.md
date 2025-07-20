# 🔧 WinSCPでのsudo権限・管理者操作ガイド

## ❌ WinSCPの制限事項

### WinSCPで直接できないこと
```
× sudo コマンドの直接実行
× ファイル権限の完全な変更（一部制限あり）
× systemctl/service コマンドの実行
× パッケージのインストール/更新
× システム設定ファイルの編集（/etc/以下など）
```

## ✅ WinSCPでできる管理者権限作業

### 1. **sudo権限ユーザーでの接続**
```
接続時にsudo権限を持つユーザーでログイン:
- ユーザー名: sudo権限のあるアカウント
- パスワード: そのアカウントのパスワード
- または秘密鍵: sudo権限ユーザーの鍵

接続後は、そのユーザーの権限でファイル操作可能
```

### 2. **ファイル権限の変更**
```
WinSCP内でできる権限操作:
✅ chmod 644, 755, 600 などの基本権限
✅ 所有者/グループの変更（権限がある場合）
✅ ファイル属性の変更

制限:
❌ システムファイルの権限変更
❌ root所有ファイルの権限変更（root接続時のみ可能）
```

### 3. **内蔵ターミナル機能**
```
WinSCP 5.17以降で利用可能:
1. メニュー「コマンド」→「ターミナルを開く」
2. SSH ターミナルが開く
3. sudo コマンドが使用可能

例:
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env
sudo systemctl restart apache2
```

## 🚀 .envアップロード時のsudo権限対応

### 方法1: sudo権限ユーザーで接続
```
WinSCP接続設定:
- ユーザー名: あなたのsudo権限ユーザー
- パスワード/鍵: そのユーザーの認証情報

接続後:
1. .envファイルをアップロード
2. ファイルを右クリック → プロパティ → 権限600に設定
3. 必要に応じて所有者をwww-dataに変更
```

### 方法2: WinSCPターミナル使用
```
1. .envファイルをアップロード（一般ユーザー権限で）
2. WinSCP内でターミナル起動
3. sudo コマンドで権限設定:

sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env
sudo systemctl restart apache2
```

### 方法3: 一般ユーザーでアップロード後、別途SSH
```
1. WinSCPで.envファイルをアップロード
2. 別途PuTTYやWindows Terminal等でSSH接続
3. sudo権限で設定変更:

ssh username@server
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env
```

## 🔧 推奨ワークフロー

### Aivis-chan Bot .envアップロード完全手順

#### Step 1: WinSCPでファイルアップロード
```
1. WinSCPでサーバー接続
2. /var/www/html/api/ に移動
3. .envファイルをドラッグ&ドロップ
4. .htaccessファイルも作成
```

#### Step 2: WinSCPターミナルで権限設定
```
WinSCP → コマンド → ターミナルを開く

# .envファイル権限設定
sudo chmod 600 /var/www/html/api/.env
sudo chown www-data:www-data /var/www/html/api/.env

# .htaccessファイル権限設定
sudo chmod 644 /var/www/html/api/.htaccess
sudo chown www-data:www-data /var/www/html/api/.htaccess

# APIディレクトリ権限設定
sudo chmod 755 /var/www/html/api/
sudo chown www-data:www-data /var/www/html/api/
```

#### Step 3: Node.jsアプリケーション設定
```
# 依存関係インストール
cd /var/www/html/api/
npm install

# PM2でサービス起動
sudo npm install -g pm2
pm2 start bot-stats-server.js --name "aivis-api"
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u www-data --hp /var/www
pm2 save
```

#### Step 4: Apache設定
```
# Apacheサービス再起動
sudo systemctl restart apache2

# SSL証明書確認（必要に応じて）
sudo certbot --apache -d your-domain.com
```

## 🛠️ WinSCPターミナルの使い方

### ターミナル起動方法
```
方法1: メニューから
コマンド → ターミナルを開く → 新しいタブでターミナル

方法2: キーボードショートカット
Ctrl + T

方法3: ツールバーボタン
ツールバーの「ターミナル」アイコンをクリック
```

### ターミナルでの基本操作
```bash
# 現在位置確認
pwd

# ファイル一覧
ls -la

# 権限変更
sudo chmod 600 filename

# 所有者変更
sudo chown user:group filename

# サービス操作
sudo systemctl status apache2
sudo systemctl restart apache2

# ログ確認
sudo tail -f /var/log/apache2/error.log
```

## ⚠️ 注意事項

### WinSCPターミナルの制限
```
❌ インタラクティブなプログラムは動作しない場合がある
❌ nano/vim等のエディタは使いにくい
❌ 画面の更新が遅い場合がある
❌ 日本語表示に問題が生じる場合がある
```

### 推奨する使い分け
```
✅ WinSCP: ファイル転送、基本的な権限設定
✅ WinSCPターミナル: 簡単なコマンド実行
✅ PuTTY/Windows Terminal: 複雑な設定作業、デバッグ
✅ VS Code Remote SSH: コード編集、開発作業
```

## 🎯 まとめ

**WinSCPでのsudo使用方法:**
1. **内蔵ターミナル機能**を使用（最も簡単）
2. **sudo権限ユーザー**で接続
3. **別途SSH接続**と併用

**.envアップロードには十分対応可能**で、WinSCPの視覚的操作とターミナルのsudo機能を組み合わせれば、完全な管理者権限作業ができます！🚀
