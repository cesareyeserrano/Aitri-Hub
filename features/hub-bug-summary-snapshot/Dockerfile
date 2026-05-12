# Feature deployment image for hub-bug-summary-snapshot.
# The feature ships inside the existing Aitri Hub Node.js web server.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S aitri && adduser -S aitri -G aitri

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY bin ./bin
COPY lib ./lib
COPY docker/web-dist ./docker/web-dist

RUN mkdir -p /data && chown -R aitri:aitri /app /data

USER aitri
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${AITRI_HUB_PORT:-3000}/health || exit 1

CMD ["node", "bin/aitri-hub.js", "web"]
