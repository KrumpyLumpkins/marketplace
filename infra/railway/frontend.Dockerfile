FROM public.ecr.aws/docker/library/node:22.23.3-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile
ARG MARKETPLACE_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MARKETPLACE_CHAIN_ID
ARG NEXT_PUBLIC_MARKETPLACE_ADDRESS
ARG NEXT_PUBLIC_MARKETPLACE_COLLECTIONS
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_MARKETPLACE_API_BASE=/api/marketplace \
    MARKETPLACE_API_URL=$MARKETPLACE_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MARKETPLACE_CHAIN_ID=$NEXT_PUBLIC_MARKETPLACE_CHAIN_ID \
    NEXT_PUBLIC_MARKETPLACE_ADDRESS=$NEXT_PUBLIC_MARKETPLACE_ADDRESS \
    NEXT_PUBLIC_MARKETPLACE_COLLECTIONS=$NEXT_PUBLIC_MARKETPLACE_COLLECTIONS
RUN test -n "$MARKETPLACE_API_URL" && test -n "$NEXT_PUBLIC_SITE_URL" && test -n "$NEXT_PUBLIC_MARKETPLACE_CHAIN_ID"
RUN pnpm build

FROM public.ecr.aws/docker/library/node:22.23.3-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=:: PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
