# Aivis-chan-bot
[![Release](https://img.shields.io/github/release/Paladise-Lost-Developer-Team/Aivis-chan-bot?include_prereleases=&sort=semver&color=blue)](https://github.com/Paladise-Lost-Developer-Team/Aivis-chan-bot/releases/)
[![Discord](https://discord.com/api/guilds/1337303326332813334/widget.png)](https://discord.gg/MPx2ny8HXT)

Aivis-chan-botは、[AivisSpeech Engine](https://github.com/Aivis-Project/AivisSpeech-Engine)を使用したDiscord読み上げBotです。\
AivisSpeechを使った、違和感のないスムーズな読み上げが可能です。

## 機能
- テキストチャンネルで送信されたテキストの読み上げ
- 読み方の辞書登録、編集・削除機能
- 話者・スタイルの変更(Anneli ノーマル / 通常 / テンション高め / 落ち着き / 上機嫌 / 怒り・悲しみ、Anneli(NSFW) ノーマル)
- 音量、速度、ピッチ、テンポの緩急の調節

## 導入方法
1. 導入URLからBOTを招待する [導入URL1](https://discord.com/oauth2/authorize?client_id=1333819940645638154), [導入URL2](https://discord.com/oauth2/authorize?client_id=1334732369831268352), [導入URL3](https://discord.com/oauth2/authorize?client_id=1334734681656262770)
2. 任意のVCに入った状態で`/join`コマンドを使用する
3. メッセージを送信すると、自動的に読み上げてくれます
4. 退出させる際は`/leave`コマンドを使用してください

## ドキュメント
- [利用規約](https://paladise-lost-developer-team.github.io/Aivis-chan-bot/Term-of-Service/)
- [プライバシーポリシー](https://paladise-lost-developer-team.github.io/Aivis-chan-bot/Privacy-Policy/)

## 前提条件

### FFmpegのインストール

このボットは音声処理にFFmpegを使用します。以下の方法でインストールしてください。

#### Windowsの場合:

1. [FFmpegの公式サイト](https://ffmpeg.org/download.html)または[FFmpeg Builds](https://ffmpeg.org/download.html#build-windows)からFFmpegをダウンロード
2. ダウンロードしたzipファイルを展開し、任意の場所（例：`C:\ffmpeg`）に配置
3. 環境変数のPathにFFmpegの実行ファイルがあるディレクトリ（例：`C:\ffmpeg\bin`）を追加

または、環境変数を設定せずに直接パスを指定することもできます：
`FFMPEG_PATH=C:\path\to\ffmpeg.exe`をボットの環境設定に追加

#### macOSの場合:

Homebrewを使用してインストール:
```bash
brew install ffmpeg
```

#### Linuxの場合:

Ubuntu/Debian:
```bash
sudo apt update
sudo apt install ffmpeg
```

CentOS/RHEL:
```bash
sudo yum install ffmpeg
```

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

...
