# Aivis-chan-bot Pro/Premium

[![Release](https://img.shields.io/github/release/Paradise-Lost-Developer-Team/Aivis-chan-bot?include_prereleases=&sort=semver&color=blue)](https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot/releases/)
[![Discord](https://discord.com/api/guilds/1337303326332813334/widget.png)](https://discord.gg/MPx2ny8HXT)

これは Aivis-chan-bot の有料版です。全てのコマンドに Patreon 連携（Pro または Premium）が必要です。\
内部 Stats API はポート 3012 で `/api/stats` を提供します。

## 機能

- テキストチャンネルで送信されたテキストの読み上げ
- 読み方の辞書登録、編集・削除機能
- 話者・スタイルの変更(Anneli、Anneli(Alt)、Anneli(Whisper)、にせ、るな、ろてじん、亜空マオ、凛音エル、花音、阿井田茂)
- 音量、速度、ピッチ、テンポの緩急の調節

## 導入方法（Pro/Premium）

1. BOTをワンクリックで招待する  [招待リンク1](https://discord.com/oauth2/authorize?client_id=1333819940645638154), [招待リンク2](https://discord.com/oauth2/authorize?client_id=1334732369831268352), [招待リンク3](https://discord.com/oauth2/authorize?client_id=1334734681656262770), [招待リンク4](https://discord.com/oauth2/authorize?client_id=1365633502988472352), [招待リンク5](https://discord.com/oauth2/authorize?client_id=1365633586123771934), [招待リンク6](https://discord.com/oauth2/authorize?client_id=1365633656173101086)
2. 任意のVCに入った状態で`/join`コマンドを使用する
3. メッセージを送信すると、自動的に読み上げてくれます
4. 退出させる際は`/leave`コマンドを使用してください

## ドキュメント

- [利用規約](https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Term-of-Service/)
- [プライバシーポリシー](https://paradise-lost-developer-team.github.io/Aivis-chan-bot/Privacy-Policy/)

## 前提条件

- Node.js v16.6.0以降
- FFmpegのインストール
  - Windows: Path に `C:\ffmpeg\bin` を追加
  - macOS: `brew install ffmpeg`
  - Linux(Debian/Ubuntu): `sudo apt install ffmpeg`

## 認証について

以下のコマンドは認証なしで利用できます：

- `/patreon`（連携・状態確認）
- `/subscription`（プラン情報）


それ以外の全コマンドは Pro または Premium の会員のみ利用可能です。

## その他のセットアップ手順

1. リポジトリをクローン  
   git clone <https://github.com/Paradise-Lost-Developer-Team/Aivis-chan-bot.git>  
2. ディレクトリに移動  
   cd Aivis-chan-bot  
3. 依存関係をインストール  
   npm install  
4. 環境変数を設定  
   - DISCORD_TOKEN: Discord Bot のトークン  
   - FFMPEG_PATH: ffmpeg 実行ファイル（未設定時）  
5. スラッシュコマンドを登録  
   npm run deploy-commands  
6. ボットを起動  
   npm start  
