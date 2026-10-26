FROM node:22-bookworm-slim AS dependencies
WORKDIR /app/backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm_config_build_from_source=true npm_config_nodedir=/usr/local npm ci --omit=dev \
    && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/database.sqlite
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/*.js backend/package.json ./backend/
COPY --chown=node:node frontend/ ./frontend/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]

FROM runtime AS test
COPY --chown=node:node backend/test/ ./backend/test/
CMD ["node", "--test", "backend/test/app.test.js", "backend/test/migration.test.js"]

FROM runtime AS app
