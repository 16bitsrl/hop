# syntax=docker/dockerfile:1

# ---- build: client (Vite) and server (esbuild) bundles ----
FROM node:22-slim AS build
ARG PNPM_VERSION=12
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:node

# ---- native module: better-sqlite3 is the only package kept outside the bundle ----
FROM node:22-slim AS native
COPY package.json /tmp/app-package.json
WORKDIR /native
RUN VERSION="$(node -p "require('/tmp/app-package.json').dependencies['better-sqlite3'].replace(/^[^0-9]*/, '')")" \
 && echo '{"name":"native","private":true}' > package.json \
 && npm install --omit=dev --no-audit --no-fund "better-sqlite3@${VERSION}"

# ---- runtime ----
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/client \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=native /native/node_modules ./node_modules
COPY --from=build /src/dist/node/server.mjs ./server.mjs
COPY --from=build /src/dist/client ./client
COPY migrations ./migrations
COPY scripts/download-geoip.mjs ./scripts/download-geoip.mjs
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# The check asks as the app host, the only host that answers /healthz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT,path:'/healthz',headers:{host:process.env.APP_HOST}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server.mjs"]
