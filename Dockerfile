
# ----- Express サーバー用 Dockerfile (multi-stage, production) -----
FROM node:current-alpine3.22 AS builder
WORKDIR /app

# Copy only package files first for reproducible installs
COPY package*.json ./

# Use npm install to avoid build failures when package-lock.json is out of sync in CI/build envs
RUN npm install --production --no-audit --no-fund

# Copy application files needed at runtime (avoid copying .git, node_modules etc.)
COPY server.js sw.js ./
COPY index.html ./
COPY dashboard.html ./
COPY manifest.json ./
COPY robots.txt ./
COPY nginx.conf ./
COPY images ./images
COPY voicelines ./voicelines
COPY css ./css
COPY js ./js
COPY faq ./faq
COPY terms ./terms
COPY privacy ./privacy
COPY docs ./docs
COPY contact ./contact
COPY blog ./blog
COPY auth/patreon ./auth/patreon
COPY far-field ./far-field	

FROM node:current-alpine3.22 AS runtime
WORKDIR /app

# Copy installed production deps and app files from builder
COPY --from=builder /app /app

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3001

# Create unprivileged user and switch to it
RUN addgroup -S app && adduser -S app -G app || true
USER app

EXPOSE 3001

# Simple healthcheck using node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
	CMD node -e "const http=require('http');const p={host:'127.0.0.1',port:process.env.PORT||3001,path:'/health'};const req=http.request(p,res=>process.exit(res.statusCode===200?0:1));req.on('error',()=>process.exit(1));req.end();"

CMD ["node", "server.js"]