FROM node:current-alpine3.22 AS builder

WORKDIR /app

# 依存ファイルを先にコピーしてキャッシュ活用
COPY ./far-field/package.json ./far-field/pnpm-lock.yaml* ./far-field/
WORKDIR /app/far-field
RUN npm install -g pnpm && pnpm install

# アプリ本体をコピー
COPY ./far-field .

# 静的リソース・htmlもSSRサーバーのpublic配下にコピー
WORKDIR /app/far-field
RUN mkdir -p public
COPY ../index.html ../index.html ./public/
COPY ../images ./public/images
COPY ../voicelines ./public/voicelines
COPY ../css ./public/css
COPY ../faq ./public/faq
COPY ../terms ./public/terms
COPY ../privacy ./public/privacy
COPY ../docs ./public/docs

# Astroビルド
RUN pnpm build

EXPOSE 3000
CMD ["npx", "astro", "preview", "--host", "0.0.0.0", "--port", "4321"]