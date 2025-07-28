# openSUSE Leap パッケージ更新 トラブルシューティング

## ライセンス同意エラーの解決

### 問題
```
ライセンス (使用許諾) 契約条項に同意しますか？ [はい/いいえ] (いいえ): いいえ
ライセンス (使用許諾) 契約に同意する必要があるため、インストールを中止します。
```

### 解決方法

#### 1. 手動でライセンス同意
```bash
# 対話的にライセンスを確認して同意
sudo zypper update

# または個別パッケージで確認
sudo zypper install ffmpeg
```

#### 2. 自動ライセンス同意
```bash
# 一回限りの自動同意
sudo zypper update --auto-agree-with-licenses

# 今後すべての更新で自動同意
sudo zypper update -y --auto-agree-with-licenses
```

#### 3. システム設定での自動同意
```bash
# zypper設定ファイルを編集
sudo nano /etc/zypp/zypp.conf

# 以下の行を追加
autoAgreeWithLicenses = yes
```

#### 4. 提供されたスクリプトを使用
```bash
# システム更新スクリプトを実行
sudo ./system-update.sh

# または自動モード
sudo ./system-update.sh auto
```

## よくある問題と解決策

### 1. NVIDIA ドライバー更新エラー

#### 問題
```
以下 14 個のパッケージ更新はインストールしません:
nvidia-driver-G06-kmp-default nvidia-gl-G06 nvidia-compute-G06 ...
```

#### 解決方法
```bash
# NVIDIAドライバーを個別に更新
sudo zypper update --auto-agree-with-licenses nvidia-*

# またはドライバーを保持
sudo zypper addlock nvidia-driver-G06-kmp-default
```

### 2. カーネル更新後の再起動

#### 問題
```
以下 2 個のパッケージをインストールするには、システムの再起動が必要です:
kernel-azure-6.4.0-150600.8.43.1 kernel-default-6.4.0-150600.23.53.1
```

#### 解決方法
```bash
# 更新完了後に再起動
sudo reboot

# 古いカーネルの削除（再起動後）
sudo zypper purge-kernels
```

### 3. ベンダー変更の警告

#### 問題
```
パッケージ 'ffmpeg' のベンダーが 'openSUSE' から 'Packman' に変更されます。
```

#### 解決方法
```bash
# ベンダー変更を許可
sudo zypper dup --allow-vendor-change

# または特定のパッケージのみ
sudo zypper install --allow-vendor-change ffmpeg
```

### 4. 依存関係の競合

#### 問題
```
依存関係の問題により、以下のパッケージをインストールできません
```

#### 解決方法
```bash
# 詳細な依存関係情報を表示
sudo zypper install --details パッケージ名

# 強制的に解決
sudo zypper install --force-resolution パッケージ名

# 代替パッケージの検索
sudo zypper search 関連キーワード
```

## 予防策

### 1. 定期的な更新設定

```bash
# 週次自動更新のcron設定
sudo crontab -e

# 毎週日曜日の午前2時に実行
0 2 * * 0 /path/to/system-update.sh auto
```

### 2. バックアップ戦略

```bash
# 更新前のシステムスナップショット
sudo snapper create -d "Before system update"

# 更新後の確認
sudo snapper list
```

### 3. 監視設定

```bash
# 更新状況のログ監視
tail -f /var/log/zypp/history

# システム再起動が必要かチェック
zypper needs-restarting
```

## 緊急時の対処

### 1. 更新失敗時のロールバック

```bash
# スナップショットからロールバック
sudo snapper rollback

# または前回の正常な状態に戻す
sudo zypper history
sudo zypper rollback <トランザクション番号>
```

### 2. パッケージデータベースの修復

```bash
# データベースの整合性チェック
sudo zypper verify

# データベースの再構築
sudo zypper refresh --force
```

### 3. リポジトリの問題

```bash
# リポジトリ一覧の確認
sudo zypper lr -d

# 問題のあるリポジトリの無効化
sudo zypper mr -d リポジトリ名

# リポジトリの再追加
sudo zypper ar URL エイリアス名
```

## システム状態の確認コマンド

```bash
# システム情報
hostnamectl
uname -a

# パッケージ状況
zypper lu  # 利用可能な更新
zypper ps  # 再起動が必要なプロセス

# ディスク使用量
df -h
du -sh /var/cache/zypp

# サービス状況
systemctl status apache2
systemctl status nginx
systemctl status firewalld

# ログ確認
journalctl -xe
tail -f /var/log/messages
```

## パフォーマンス最適化

### 1. パッケージキャッシュの管理

```bash
# キャッシュサイズの確認
du -sh /var/cache/zypp

# 古いキャッシュの削除
sudo zypper clean --all

# 定期的なクリーンアップ設定
echo "0 3 * * 1 zypper clean --all" | sudo crontab -
```

### 2. 並列ダウンロードの有効化

```bash
# /etc/zypp/zypp.conf に追加
download.max_concurrent_connections = 5
```

### 3. ミラーサーバーの最適化

```bash
# 最速ミラーの選択
sudo zypper mr --all --refresh

# 地理的に近いミラーの選択
sudo zypper lr -u  # URL確認
```

## 7. 特定のパッケージ競合問題

### 7.1 NVIDIA Container Runtime ファイル競合

**問題**: `nvidia-container-toolkit` と `nvidia-container-runtime` パッケージ間でファイル競合が発生

```
File /usr/bin/nvidia-container-runtime
  from install of nvidia-container-toolkit-1.11.0-150200.5.11.1.x86_64 (update-sle (15.6))
  conflicts with file from package nvidia-container-runtime-3.5.0-150200.5.9.1.x86_64 (@System)
```

**解決方法**:

1. **推奨方法**: 段階的パッケージ更新
```bash
# 古いパッケージを削除
sudo zypper remove nvidia-container-runtime

# 新しいパッケージをインストール
sudo zypper install --auto-agree-with-licenses nvidia-container-toolkit
```

2. **代替方法**: 強制解決
```bash
# 競合ファイルをバックアップ
sudo cp /usr/bin/nvidia-container-runtime /usr/bin/nvidia-container-runtime.backup

# 強制的に更新
sudo zypper update --auto-agree-with-licenses --force-resolution
```

3. **クイックフィックススクリプト使用**:
```bash
sudo chmod +x server-setup/quick-fix-nvidia.sh
sudo ./server-setup/quick-fix-nvidia.sh
```

### 7.2 その他のファイル競合

**一般的な対処法**:

1. **競合パッケージの確認**:
```bash
rpm -qa | grep パッケージ名
zypper search --installed-only パッケージ名
```

2. **競合ファイルの詳細確認**:
```bash
rpm -qf /path/to/conflicting/file
ls -la /path/to/conflicting/file
```

3. **解決オプション**:
   - `--force-resolution`: 強制的に競合を解決
   - `--force`: 強制インストール
   - パッケージの個別削除・再インストール

## 8. パフォーマンス最適化

### 1. キャッシュ管理

```bash
# 古いキャッシュの削除
sudo zypper clean --all

# 定期的なクリーンアップ設定
echo "0 3 * * 1 zypper clean --all" | sudo crontab -
```

### 2. 並列ダウンロードの有効化

```bash
# /etc/zypp/zypp.conf に追加
download.max_concurrent_connections = 5
```

### 3. ミラーサーバーの最適化

```bash
# 最速ミラーの選択
sudo zypper mr --all --refresh

# 地理的に近いミラーの選択
sudo zypper lr -u  # URL確認
```

## 9. まとめ

このガイドでは、openSUSE Leapでの一般的なパッケージ管理問題とその解決方法を説明しました。特にファイル競合問題は慎重に対処する必要があります。

問題が解決しない場合は、openSUSEコミュニティフォーラムやサポートチャンネルでの相談をお勧めします。

定期的なシステム更新と適切なパッケージ管理により、多くの問題を予防できます。

## 参考リンク

- [openSUSE Leap Documentation](https://doc.opensuse.org/)
- [Zypper Command Reference](https://en.opensuse.org/SDB:Zypper_manual)
- [Package Management](https://doc.opensuse.org/documentation/leap/reference/html/book-reference/cha-sw-cl.html)
