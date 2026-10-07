FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY services/marketplace-backend/ services/marketplace-backend/
COPY config/marketplace/ config/marketplace/
# Railway mounts volumes as root. This service must be able to write the mount.
RUN mkdir -p /data
ENV NODE_ENV=production MARKETPLACE_HOST=:: PORT=3100 MARKETPLACE_DB=/data/chain.sqlite MARKETPLACE_ASSET_DIR=/data/assets MARKETPLACE_API_WORKERS=1 MARKETPLACE_INDEXER_ENABLED=false
EXPOSE 3100
CMD ["node", "services/marketplace-backend/src/railway.mjs"]
