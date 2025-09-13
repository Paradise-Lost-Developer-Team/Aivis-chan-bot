FROM node:current-alpine3.22 AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Use npm ci when a lockfile exists for reproducible installs; otherwise fall back to npm install.
# npm ci fails if package-lock.json is missing, which caused the build error seen in the log.
RUN if [ -f package-lock.json ]; then \
			npm ci --omit=dev; \
		else \
			npm install --omit=dev; \
		fi
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
