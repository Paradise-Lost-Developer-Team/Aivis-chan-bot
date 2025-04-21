# Aivis-chan-bot
[![Release](https://img.shields.io/github/release/Paladise-Lost-Developer-Team/Aivis-chan-bot?include_prereleases=&sort=semver&color=blue)](https://github.com/Paladise-Lost-Developer-Team/Aivis-chan-bot/releases/)
[![Discord](https://discord.com/api/guilds/1337303326332813334/widget.png)](https://discord.gg/MPx2ny8HXT)

Aivis-chan-botは、[AivisSpeech Engine](https://github.com/Aivis-Project/AivisSpeech-Engine)を使用したDiscord読み上げBotです。\
AivisSpeechを使った、違和感のないスムーズな読み上げが可能です。

## 機能
- テキストチャンネルで送信されたテキストの読み上げ
- 読み方の辞書登録、編集・削除機能
- 話者・スタイルの変更(Anneli、Anneli(Alt)、Anneli(Whisper)、にせ、るな、亜空マオ)
- 音量、速度、ピッチ、テンポの緩急の調節

## 導入方法
1. BOTをワンクリックで招待する  [招待リンク1](https://discord.com/oauth2/authorize?client_id=1333819940645638154) [招待リンク2](https://discord.com/oauth2/authorize?client_id=1334732369831268352) [招待リンク3](https://discord.com/oauth2/authorize?client_id=1334734681656262770)
2. 任意のVCに入った状態で`/join`コマンドを使用する
3. メッセージを送信すると、自動的に読み上げてくれます
4. 退出させる際は`/leave`コマンドを使用してください

## ドキュメント
- [利用規約](https://paladise-lost-developer-team.github.io/Aivis-chan-bot/Term-of-Service/)
- [プライバシーポリシー](https://paladise-lost-developer-team.github.io/Aivis-chan-bot/Privacy-Policy/)

## 前提条件
- Node.js v16.6.0以降
- FFmpegのインストール
  - Windows: Path に `C:\ffmpeg\bin` を追加
  - macOS: `brew install ffmpeg`
  - Linux(Debian/Ubuntu): `sudo apt install ffmpeg`

## Pro版・Premium版について

Aivis-chan-botには有料の「Pro版」と「Premium版」があります。

### Pro版特典 (月額$5)

- 読み上げ制限が400文字に拡張
- Pro版専用の追加音声モデル
- 高度な音声設定オプション
- 優先サポート

### Premium版特典 (月額$10)

- 読み上げ制限が800文字に拡張
- Premium版専用の追加音声モデル
- すべてのPro版特典を含む
- 最優先サポート

詳細および購入方法については、Botの `/subscription` コマンドで確認できます。

## その他のセットアップ手順

1. リポジトリをクローン  
   git clone https://github.com/Paladise-Lost-Developer-Team/Aivis-chan-bot.git  
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
