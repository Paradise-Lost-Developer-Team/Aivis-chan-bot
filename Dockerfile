FROM node:22-alpine

WORKDIR /app

# 依存関係をインストール
COPY package*.json ./
RUN npm install

# アプリのソースと静的ファイルをコピー
COPY . .

# ポートを公開（HTTPS: 443）
EXPOSE 443

# 証明書と秘密鍵はcertsディレクトリにマウントして利用
# 例: docker run -v /path/to/certs:/app/certs ...

# アプリ起動（例: server.jsでHTTPSサーバを起動）
CMD ["node", "server.js"]
