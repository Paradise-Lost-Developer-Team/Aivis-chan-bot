#!/bin/bash
# pm2 を使って Bot をデーモン起動（TypeScript は事前ビルド必要）

echo "🔄 ビルド中..."
npx tsc

echo "🚀 pm2 で起動中..."
<<<<<<< HEAD
pm2 start build/js/index.js --name aivis-bot-2nd
=======
pm2 start build/js/index.js --name aivis-bot
>>>>>>> origin
