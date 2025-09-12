# ----- ビルドステージ -----
FROM node:current-alpine3.22 AS builder
# Use the latest slim image for security updates
RUN apk add --no-cache ffmpeg python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev jpeg-dev giflib-dev musl-dev
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
# ビルド時のためにダミーのconfig.jsonを作成
RUN mkdir -p data && echo '{"clientId":"build_dummy","TOKEN":"build_dummy","guildId":"build_dummy","PATREON":{"CLIENT_ID":"build_dummy","CLIENT_SECRET":"build_dummy","REDIRECT_URI":"http://localhost/auth/patreon/callback","FALLBACK_SERVER":"http://aivis-chan-bot-web:80"}}' > data/config.json
RUN npm run compile
FROM node:current-alpine3.22
# Use the latest slim image for security updates

RUN apk add --no-cache ffmpeg
WORKDIR /usr/src/app
# node_modulesをそのままコピー
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/build/js ./build/js
# 注意: data/config.jsonは実行時にKubernetes ConfigMapでマウントされます

CMD ["node", "build/js/index.js"]
