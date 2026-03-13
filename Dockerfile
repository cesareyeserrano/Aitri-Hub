# Stage 1 — Build React application
FROM node:18-alpine AS builder
WORKDIR /build
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2 — nginx static server
FROM nginx:1.27-alpine

# Copy built React assets
COPY --from=builder /build/dist /app/web
# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Grant nginx user write access to required cache/run directories
RUN mkdir -p /var/cache/nginx/client_temp \
             /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp \
             /var/run \
    && chown -R nginx:nginx /var/cache/nginx /var/run \
    && chmod -R 755 /var/cache/nginx

# Run as non-root nginx user
USER nginx

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
