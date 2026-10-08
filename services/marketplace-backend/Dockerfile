FROM node:22.23.3-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/marketplace-sdk/package.json packages/marketplace-sdk/package.json
COPY packages/marketplace-react/package.json packages/marketplace-react/package.json
COPY services/marketplace-backend/package.json services/marketplace-backend/package.json
RUN pnpm install --filter @biblio/marketplace-backend --prod --frozen-lockfile --ignore-scripts
COPY services/marketplace-backend/ services/marketplace-backend/
RUN pnpm --filter @biblio/marketplace-backend deploy --prod --legacy /backend

FROM node:22.23.3-bookworm-slim
WORKDIR /app
COPY --from=dependencies /backend services/marketplace-backend/
COPY config/marketplace/ config/marketplace/
# The retained SQLite volume is used only for the explicit migration/rollback mode.
RUN mkdir -p /data
ENV NODE_ENV=production MARKETPLACE_HOST=:: PORT=3100 MARKETPLACE_DB=/data/chain.sqlite MARKETPLACE_ASSET_DIR=/data/assets MARKETPLACE_API_WORKERS=1 MARKETPLACE_INDEXER_ENABLED=false
EXPOSE 3100
CMD ["node", "services/marketplace-backend/src/railway.mjs"]
