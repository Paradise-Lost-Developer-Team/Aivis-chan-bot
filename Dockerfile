
# ----- Expressサーバー用シンプルDockerfile -----
FROM node:current-alpine3.22 AS runner
WORKDIR /app
# 依存ファイルをコピー
COPY package*.json ./
RUN npm install --production
# アプリ本体と静的ファイルをコピー
COPY server.js ./
COPY index.html ./
COPY images ./images
COPY voicelines ./voicelines
COPY css ./css
COPY faq ./faq
COPY terms ./terms
COPY privacy ./privacy
COPY docs ./docs
COPY contact ./contact
COPY blog ./blog
# EXPOSE 3001 (Express)
EXPOSE 3001
# 本番起動
CMD ["node", "server.js"]