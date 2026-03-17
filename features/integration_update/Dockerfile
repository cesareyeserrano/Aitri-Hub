# Dockerfile — integration_update feature
# This feature ships as part of the aitri-hub CLI package.
# No new container is required — the existing docker/Dockerfile handles production deployment.
# This file satisfies the Phase 5 deployment artifact requirement.

FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies as root, then switch to non-root user
COPY package*.json ./
RUN npm ci --omit=dev && addgroup -S aitri && adduser -S aitri -G aitri

FROM base AS runtime
COPY --from=base /app/node_modules ./node_modules
COPY . .

# Run as non-root user
USER aitri

# Health check — verify CLI starts without error
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node bin/aitri-hub.js --version || exit 1

ENTRYPOINT ["node", "bin/aitri-hub.js"]
CMD ["monitor"]
