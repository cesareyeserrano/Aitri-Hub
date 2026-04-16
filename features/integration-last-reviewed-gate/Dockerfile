# Dockerfile — integration-last-reviewed-gate (feature web build)
#
# This feature ships as part of the parent aitri-hub Docker image.
# This Dockerfile builds only the React web bundle for the feature's
# component additions. For full deployment, use the root docker-compose.yml.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install web dependencies
COPY web/package*.json ./web/
RUN npm --prefix web ci --ignore-scripts

# Copy web source (includes IntegrationAlertBanner + FeatureSummarySection)
COPY web/ ./web/

# Build static bundle
RUN npm --prefix web run build
# Output: web/docker/web-dist/

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Non-root user — security baseline
RUN addgroup -S hubweb && adduser -S hubweb -G hubweb

# Copy built bundle
COPY --from=builder /app/web/docker/web-dist/ /usr/share/nginx/html/

# nginx config: serve static files + proxy dashboard.json from /data/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Own html dir
RUN chown -R hubweb:hubweb /usr/share/nginx/html /var/cache/nginx /var/run

USER hubweb

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1
