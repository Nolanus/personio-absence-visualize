# Stage 1: build frontend assets
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install dependencies for root, backend, and frontend
RUN npm install \
    && cd backend && npm install \
    && cd ../frontend && npm install

    # Build frontend (Vite)
    WORKDIR /app/frontend
    COPY frontend/ .
    RUN npm run build

# Stage 2: runtime container
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Create non-root user
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

# Copy backend application code and its node_modules from build stage
COPY backend/package.json ./backend/package.json
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY backend/server.js ./backend/server.js

# Copy built frontend into /public so the backend can serve it
COPY --from=build /app/frontend/dist ./public

# Ensure correct ownership
RUN chown -R nodeuser:nodegroup /app

USER nodeuser

# Default port; can be overridden at runtime
ENV PORT=8080
EXPOSE 8080

WORKDIR /app/backend

CMD ["node", "server.js"]
