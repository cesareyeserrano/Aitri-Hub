# Stage 1 — Build React SPA
FROM node:20-alpine AS builder
WORKDIR /build
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2 — Runtime (Node.js server + built SPA)
FROM node:20-alpine AS runtime
WORKDIR /app

# Non-root user for security
RUN addgroup -S aitri && adduser -S aitri -G aitri

COPY package.json ./
RUN npm install --omit=dev

COPY bin/ ./bin/
COPY lib/ ./lib/
COPY --from=builder /build/dist ./docker/web-dist/

RUN mkdir -p /data && chown aitri:aitri /data

USER aitri

ENV AITRI_HUB_PORT=3000
ENV AITRI_HUB_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "bin/aitri-hub.js", "web"]
