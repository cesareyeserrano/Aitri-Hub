# Stage 1 — Build React application
FROM node:20-alpine AS builder
WORKDIR /build
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2 — nginx static server
FROM nginx:1.27-alpine
# Copy built React assets
COPY --from=builder /build/../docker/web-dist /app/web
# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
