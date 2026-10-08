import { defineRailway, project, service, volume, image } from 'railway/iac';

export default defineRailway((ctx) => {
  if (ctx.projectId && ctx.projectId !== '554683c6-4840-40d5-a60b-864d7d1f4c25') {
    throw new Error('Select Railway project 554683c6-4840-40d5-a60b-864d7d1f4c25.');
  }
  if (ctx.projectName && ctx.projectName !== 'realms-marketplace') {
    throw new Error('Link the dedicated realms-marketplace project before planning.');
  }
  if (!['staging', 'production'].includes(ctx.environment ?? '')) {
    throw new Error('Select the staging or production Railway environment explicitly.');
  }
  const prod = ctx.environment === 'production';
  const chain = prod ? 'SN_MAIN' : 'SN_SEPOLIA';
  // Environment-local resource: never attach staging to production data.
  const data = volume('marketplace-data', { region: 'asia-southeast1-eqsg3a', sizeMB: prod ? 25600 : 5120 });
  const postgresData = volume('postgres-data', { region: 'asia-southeast1-eqsg3a', sizeMB: prod ? 25600 : 5120 });
  const postgres = service('postgres', {
    source: image('postgres:18.6'),
    replicas: { 'asia-southeast1-eqsg3a': 1 },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10, sleepApplication: false, requiredMountPath: '/var/lib/postgresql', overlapSeconds: 0, drainingSeconds: 30 },
    volumeMounts: { '/var/lib/postgresql': postgresData },
    env: {
      POSTGRES_DB: 'marketplace', POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: ctx.shared.POSTGRES_ADMIN_PASSWORD,
      PGDATA: '/var/lib/postgresql/18/docker',
    },
  });
  const worker = (name: 'indexer' | 'metadata', role: 'index' | 'metadata') => service(name, {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'infra/railway/backend.Dockerfile' },
    start: 'node services/marketplace-backend/src/railway.mjs',
    healthcheck: '/health/live', healthcheckTimeout: 120,
    replicas: { 'asia-southeast1-eqsg3a': 1 },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10, sleepApplication: false, overlapSeconds: 0, drainingSeconds: 30 },
    env: {
      PORT: '3100', MARKETPLACE_HOST: '::', MARKETPLACE_CHAIN: chain,
      MARKETPLACE_STORE: 'postgres', MARKETPLACE_PROCESS_ROLE: role,
      MARKETPLACE_PG_POOL_SIZE: '4',
      DATABASE_URL: role === 'index' ? ctx.shared.POSTGRES_INDEX_DATABASE_URL : ctx.shared.POSTGRES_METADATA_DATABASE_URL,
      MARKETPLACE_RPC_URL: ctx.shared.STARKNET_RPC_URL,
      MARKETPLACE_RPC_FALLBACK_URL: ctx.shared.STARKNET_RPC_FALLBACK_URL,
      MARKETPLACE_REGISTRY_JSON: ctx.shared.MARKETPLACE_REGISTRY_JSON,
      MARKETPLACE_BACKGROUND_ENABLED: ctx.shared.POSTGRES_BACKGROUND_ENABLED,
    },
  });
  const indexer = worker('indexer', 'index');
  const metadata = worker('metadata', 'metadata');
  const backend = service('backend', {
    // No GitHub auto-deploy source: upload reviewed releases explicitly with railway up.
    build: { builder: 'DOCKERFILE', dockerfilePath: 'infra/railway/backend.Dockerfile' },
    start: 'node services/marketplace-backend/src/railway.mjs',
    healthcheck: '/health/live',
    healthcheckTimeout: 120,
    replicas: { 'asia-southeast1-eqsg3a': 1 },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10, sleepApplication: false, requiredMountPath: '/data', overlapSeconds: 0, drainingSeconds: 10 },
    volumeMounts: { '/data': data },
    env: {
      MARKETPLACE_STORE: ctx.shared.MARKETPLACE_STORE,
      MARKETPLACE_PROCESS_ROLE: 'api', MARKETPLACE_PG_POOL_SIZE: '10',
      DATABASE_URL: ctx.shared.POSTGRES_API_DATABASE_URL,
      MARKETPLACE_MAINTENANCE: ctx.shared.MARKETPLACE_MAINTENANCE,
      MARKETPLACE_TRUSTED_PROXY_HOSTS: 'web.railway.internal',
      PORT: '3100', MARKETPLACE_HOST: '::', MARKETPLACE_CHAIN: chain,
      MARKETPLACE_ORIGIN: ctx.shared.PUBLIC_ORIGIN,
      MARKETPLACE_OPERATOR_TOKEN: ctx.shared.OPERATOR_TOKEN,
      MARKETPLACE_RPC_URL: ctx.shared.STARKNET_RPC_URL,
      MARKETPLACE_RPC_FALLBACK_URL: ctx.shared.STARKNET_RPC_FALLBACK_URL,
      MARKETPLACE_REGISTRY_JSON: ctx.shared.MARKETPLACE_REGISTRY_JSON,
      MARKETPLACE_BACKGROUND_ENABLED: ctx.shared.MARKETPLACE_BACKGROUND_ENABLED,
      MARKETPLACE_INDEXER_ENABLED: 'false', MARKETPLACE_API_WORKERS: '1',
      RAILWAY_RUN_UID: '0',
    },
  });
  const web = service('web', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'infra/railway/frontend.Dockerfile' },
    start: 'node server.js', healthcheck: '/health', healthcheckTimeout: 120,
    replicas: { 'asia-southeast1-eqsg3a': 1 },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10, sleepApplication: false },
    env: {
      NODE_ENV: 'production', PORT: '3000', HOSTNAME: '::',
      MARKETPLACE_API_URL: 'http://backend.railway.internal:3100',
      NEXT_PUBLIC_SITE_URL: ctx.shared.PUBLIC_ORIGIN,
      NEXT_PUBLIC_MARKETPLACE_CHAIN_ID: chain,
      NEXT_PUBLIC_MARKETPLACE_ADDRESS: ctx.shared.MARKETPLACE_ADDRESS,
      NEXT_PUBLIC_MARKETPLACE_COLLECTIONS: ctx.shared.MARKETPLACE_COLLECTIONS,
      NEXT_PUBLIC_MARKETPLACE_API_BASE: '/api/marketplace',
    },
  });
  backend.volumeAttachments!['marketplace-data'].backupSchedules = ['DAILY', 'WEEKLY'];
  postgres.volumeAttachments!['postgres-data'].backupSchedules = ['DAILY', 'WEEKLY'];
  return project('realms-marketplace', { resources: [web, backend, indexer, metadata, postgres, data, postgresData] });
});
