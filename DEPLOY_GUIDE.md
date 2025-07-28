# Aivis-chan Bot 完全版サイト デプロイガイド

## 📋 概要
GitHub Pagesの代わりとなる、本格的なAivis-chan Botホームページの配置完了！

## 🎯 実装した機能
- **ホームページ**: Aivis-chanのブランディングに合わせたモダンデザイン
- **Botセットアップガイド**: わかりやすい導入手順
- **Patreon統合**: Pro (¥500/月)・Premium (¥1,000/月)プラン
- **PWA対応**: スマホアプリのような体験
- **レスポンシブ**: PC・スマホ・タブレット対応

## 🚀 配置方法

### 1. サーバーでクイックセットアップ実行
```bash
# 設定スクリプトを実行
sudo bash /home/$(whoami)/Aivis-chan-bot-web/server-setup/cloudflare-quick-setup.sh
```

これで以下が自動実行されます：
- Apache設定
- SSL証明書取得（Let's Encrypt）
- 完全版サイト配置
- Cloudflare設定

### 2. カスタマイズが必要な項目

#### Discord Bot ID設定
`index.html` 内の以下を実際のBot IDに変更：
```html
<!-- 現在: YOUR_BOT_ID -->
<!-- 変更: 実際のDiscord Bot ID -->
```

#### Patreonリンク設定
`index.html` 内のPatreonリンクを実際のURLに変更：
```html
<!-- Pro: https://www.patreon.com/aivis_chan_bot -->
<!-- Premium: https://www.patreon.com/aivis_chan_bot -->
```

#### 画像ファイル差し替え
以下のプレースホルダーを実際の画像に置き換えてください：
- `images/icon-192.png` - PWAアイコン (192x192)
- `images/icon-512.png` - PWAアイコン (512x512)
- `images/hero-bg.jpg` - ヒーロー背景画像

## 📁 ファイル構成
```
/srv/www/htdocs/aivis-chan-bot.com/
├── index.html          # メインページ（完全版）
├── css/
│   └── main.css        # スタイル
├── js/
│   └── main.js         # インタラクティブ機能
├── images/
│   ├── icon-192.png    # PWAアイコン
│   ├── icon-512.png    # PWAアイコン
│   └── hero-bg.jpg     # ヒーロー画像
├── manifest.json       # PWA設定
├── sw.js              # Service Worker
└── offline.html       # オフライン表示
```

## 🌟 新機能
- **アニメーション効果**: スクロールで要素がフェードイン
- **価格プラン表示**: Patreonプランの明確な料金表示
- **コマンドリファレンス**: Bot使い方ガイド
- **サポート情報**: DiscordサーバーとPatreonへの誘導
- **PWA**: スマホでアプリのように使用可能

## 📝 今後の拡張
- ユーザーダッシュボード
- Bot統計表示
- ユーザー設定ページ
- 詳細ドキュメント

## ✅ 確認方法
1. https://aivis-chan-bot.com にアクセス
2. レスポンシブデザインの確認（スマホ・タブレット）
3. PWA機能のテスト（Add to Home Screen）
4. Patreonリンクの動作確認

これでGitHub Pagesを完全に置き換える本格的なサイトが完成です！
