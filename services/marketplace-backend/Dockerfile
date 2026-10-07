FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY services/marketplace-backend/ services/marketplace-backend/
COPY config/marketplace/ config/marketplace/
RUN mkdir -p /data && chown node:node /data
USER node
ENV MARKETPLACE_HOST=0.0.0.0 MARKETPLACE_PORT=3100 MARKETPLACE_DB=/data/chain.sqlite MARKETPLACE_ASSET_DIR=/data/assets
EXPOSE 3100
CMD ["node", "services/marketplace-backend/src/server.mjs"]
