# ----- ビルドステージ -----
FROM node:22 AS builder
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    --no-install-recommends
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run compile

# ----- 実行ステージ -----
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

# node_modulesをそのままコピー
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/build/js ./build/js

CMD ["node", "build/js/index.js"]
