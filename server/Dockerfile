FROM node:current-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production
COPY . .

FROM node:current-alpine3.22
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app /app
USER appuser
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "index.js"]
