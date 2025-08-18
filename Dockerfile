# ----- ビルドステージ -----
FROM node:current-alpine3.22 AS builder
# Use the latest slim image for security updates
RUN apk add --no-cache ffmpeg python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev jpeg-dev giflib-dev musl-dev
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN npm run compile
COPY . .
FROM node:current-alpine3.22
# Use the latest slim image for security updates

RUN apk add --no-cache ffmpeg
WORKDIR /usr/src/app
# node_modulesをそのままコピー
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/build/js ./build/js

CMD ["node", "build/js/index.js"]
