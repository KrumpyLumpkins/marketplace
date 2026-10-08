import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import config from '../../.railway/railway.ts';
import { createRailwayContext, project, validateGraph } from 'railway/iac';

for (const environment of ['staging', 'production']) {
  const definition = await config(createRailwayContext({ environment }), project);
  const resources = definition.resources.flat();
  assert.deepEqual(validateGraph({ version: 1, project: { name: definition.name }, environments: [{ name: environment }], resources, edges: [] }), []);
  const backend = resources.find(r => r.address === 'service.backend');
  const web = resources.find(r => r.address === 'service.web');
  assert.equal(backend.variables.MARKETPLACE_CHAIN.value, environment === 'production' ? 'SN_MAIN' : 'SN_SEPOLIA');
  assert.deepEqual(web.variables.NEXT_PUBLIC_MARKETPLACE_CHAIN_ID, backend.variables.MARKETPLACE_CHAIN);
  const indexer = resources.find(r => r.address === 'service.indexer');
  const metadata = resources.find(r => r.address === 'service.metadata');
  const postgres = resources.find(r => r.address === 'database.postgres');
  assert.ok(indexer && metadata && postgres, 'PostgreSQL and independent worker services are required');
  assert.equal(resources.filter(r => r.type === 'volume').length, 2);
  assert.equal(postgres.source.image, 'postgres:18.6');
  for (const worker of [indexer, metadata]) {
    assert.equal(worker.variables.MARKETPLACE_STORE.value, 'postgres');
    assert.equal(worker.deploy.healthcheckPath, '/health/live');
    assert.equal(Object.keys(worker.volumeAttachments ?? {}).length, 0);
    assert.equal(Object.keys(worker.variables).some(k => /OPERATOR|SIGNER|ADMIN_PASSWORD/.test(k)), false);
  }
  assert.notDeepEqual(backend.variables.DATABASE_URL, indexer.variables.DATABASE_URL);
  assert.notDeepEqual(indexer.variables.DATABASE_URL, metadata.variables.DATABASE_URL);
  assert.equal(postgres.volumeAttachments['postgres-data'].mountPath, '/var/lib/postgresql');
  assert.deepEqual(postgres.volumeAttachments['postgres-data'].backupSchedules, ['DAILY', 'WEEKLY']);
  assert.equal(resources.find(r => r.type === 'volume').config.sizeMB, environment === 'production' ? 25600 : 5120);
  assert.equal(backend.volumeAttachments['marketplace-data'].mountPath, '/data');
  assert.deepEqual(backend.volumeAttachments['marketplace-data'].backupSchedules, ['DAILY', 'WEEKLY']);
  assert.equal(backend.deploy.requiredMountPath, '/data');
  assert.equal(backend.deploy.overlapSeconds, 0);
  assert.equal(Object.values(backend.deploy.multiRegionConfig).reduce((n, r) => n + r.numReplicas, 0), 1);
  assert.equal(backend.deploy.healthcheckPath, '/health/live');
  assert.equal(backend.variables.MARKETPLACE_TRUSTED_PROXY_HOSTS.value, 'web.railway.internal');
  for (const service of [backend, web]) {
    assert.ok(existsSync(service.build.dockerfilePath));
    assert.equal(service.kind, 'empty', 'Config must not implicitly enable GitHub deployments');
    assert.equal(service.deploy.sleepApplication, false);
  }
  for (const key of Object.keys(web.variables)) assert.ok(!/OPERATOR|PRIVATE_KEY|RPC_URL|REGISTRY_JSON/.test(key));
  console.log(`${environment}: valid Railway graph, isolated chain, PostgreSQL with separate API/index/metadata services, no frontend secrets.`);
}
assert.throws(() => config(createRailwayContext({ environment: 'preview' }), project), /explicitly/);
assert.throws(() => config(createRailwayContext({ environment: 'production', projectName: 'unrelated-project' }), project), /dedicated/);

assert.throws(() => config(createRailwayContext({ environment: 'production', projectId: 'wrong-project' }), project), /Select Railway project/);
