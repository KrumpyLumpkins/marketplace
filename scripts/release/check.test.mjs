import { expect, it } from 'vitest';
import { unsafeReleasePaths } from './check.mjs';
it('rejects local environment, keys, databases and generated state without reading secrets', () => {
  const paths = ['.env.local','services/api/.env.production','.context/log.txt','data/chain.sqlite-wal','data/chain.sqlite.app','data/chain.sqlite.app-shm','certificates/private.pem','packages/sdk/node_modules/a.js','tsconfig.tsbuildinfo'];
  expect(unsafeReleasePaths(paths)).toEqual(paths);
});
it('allows reviewed configuration examples and application sources', () => {
  expect(unsafeReleasePaths(['.env.frontend.example','.env.backend.example','src/app/page.tsx','contracts/marketplace/abi.json','pnpm-lock.yaml'])).toEqual([]);
});
