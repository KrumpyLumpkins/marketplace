import { test } from 'node:test';
import assert from 'node:assert/strict';
import { railwayEnvironment } from '../src/railway.mjs';

test('Railway uses one mounted database and separate supervised workers', () => {
  const env = railwayEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/data', PORT: '8080' });
  assert.equal(env.MARKETPLACE_PORT, '8080');
  assert.equal(env.MARKETPLACE_HOST, '::');
  assert.equal(env.MARKETPLACE_DB, '/data/chain.sqlite');
  assert.equal(env.MARKETPLACE_API_WORKERS, '1');
  assert.equal(env.MARKETPLACE_INDEXER_ENABLED, 'false');
  assert.match(env.MARKETPLACE_REGISTRY_PATH, /registry.realms.json$/);
});

test('Railway refuses ephemeral storage and invalid ports', () => {
  assert.throws(() => railwayEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'production' }), /volume/i);
  assert.throws(() => railwayEnvironment({ PORT: 'not-a-port' }), /port/i);
  assert.throws(() => railwayEnvironment({ PORT: '65536' }), /port/i);
});

test('deployment registry can be supplied without baking identities into the image', async () => {
  const { runtime } = await import('../src/runtime.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'railway-registry-'));
  let instance;
  try {
    instance = runtime({
      MARKETPLACE_CHAIN: 'SN_SEPOLIA', MARKETPLACE_DB: join(dir, 'chain.sqlite'),
      MARKETPLACE_REGISTRY_JSON: JSON.stringify({ chains: { SN_SEPOLIA: {
        chainId: '0x534e5f5345504f4c4941', marketplace: '0x123', collections: [], currencies: [],
      } } }),
    });
    assert.equal(instance.config.marketplace, '0x123');
  } finally { instance?.store.close(); rmSync(dir, { recursive: true, force: true }); }
});
