
# ----- ビルドステージ -----
FROM node:current-alpine3.22 AS builder
WORKDIR /app
# 依存ファイルを先にコピーしてキャッシュ活用
COPY ./far-field/package*.json ./far-field/
WORKDIR /app/far-field
RUN npm install
# アプリ本体をコピー
COPY ./far-field .
# 静的リソースをpublic配下にコピー
COPY ./index.html ./public/
COPY ./images ./public/images
COPY ./voicelines ./public/voicelines
COPY ./css ./public/css
COPY ./faq ./public/faq
COPY ./terms ./public/terms
COPY ./privacy ./public/privacy
COPY ./docs ./public/docs
# Astroビルド
RUN npm run build

# ----- 本番ステージ -----
FROM node:current-alpine3.22 AS runner
WORKDIR /app/far-field
# node_modulesとビルド成果物のみコピー
COPY --from=builder /app/far-field/node_modules ./node_modules
COPY --from=builder /app/far-field/dist ./dist
COPY --from=builder /app/far-field/public ./public
COPY --from=builder /app/far-field/package.json ./
# EXPOSE 4321 (Astro SSR)
EXPOSE 4321
# 本番起動
CMD ["node", "dist/server/entry.mjs"]