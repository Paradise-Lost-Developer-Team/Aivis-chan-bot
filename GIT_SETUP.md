# Git リモート設定修正完了！

## 📋 修正内容
- リモート名: `web` → `origin` に変更
- 現在のブランチ: `web` (正常に origin/web を追跡)

## 🔧 利用可能なGitコマンド

### 基本操作
```bash
# 変更をコミット
git add .
git commit -m "Update: description"

# リモートにプッシュ
git push origin web

# リモートから最新を取得
git pull origin web

# ブランチ一覧確認
git branch -a
```

### ブランチ操作
```bash
# 他のブランチに切り替え
git checkout master
git checkout 2nd
git checkout 3rd
# ...等

# 新しいブランチ作成
git checkout -b new-feature

# webブランチに戻る
git checkout web
```

### リモート操作
```bash
# リモート設定確認
git remote -v

# リモートブランチ確認
git branch -r

# 全ブランチの最新状態を取得
git fetch origin
```

## 🎯 推奨ワークフロー

### Webサイト更新時
1. 変更をコミット
```bash
git add .
git commit -m "Update: website improvements"
```

2. リモートにプッシュ
```bash
git push origin web
```

3. Apacheサーバーにデプロイ
```bash
./upload.sh
# または
.\quick-update.ps1 -UpdateType all
```

## 📚 利用可能なブランチ
- `master` - メインブランチ
- `web` - Webサイト用ブランチ（現在のブランチ）
- `2nd`, `3rd`, `4th`, `5th`, `6th` - 各Bot専用ブランチ

現在の設定で正常にGit操作が可能です！
