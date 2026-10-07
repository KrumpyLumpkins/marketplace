import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Verification builds target local fixtures, never inherited live deployment inputs. */
export function releaseEnvironment(base = process.env) {
  return {
    ...base,
    NEXT_PUBLIC_MARKETPLACE_CHAIN_ID: 'SN_MAIN',
    NEXT_PUBLIC_MARKETPLACE_ADDRESS: '',
    NEXT_PUBLIC_MARKETPLACE_COLLECTIONS: '',
    NEXT_PUBLIC_MARKETPLACE_API_BASE: '/api/marketplace',
    NEXT_PUBLIC_STARKNET_RPC_URL: 'http://127.0.0.1:3400/api/marketplace/rpc',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3400',
    MARKETPLACE_API_URL: 'http://127.0.0.1:3100',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const steps = ['release:check', 'railway:check', 'sdk:test', 'sdk:pack:test', 'backend:test', 'contracts:test', 'contracts:build', 'lint', 'typecheck', 'test:coverage', 'storybook:build', 'build', 'test:e2e'];
  console.log('Verifying local fixtures. Rebuild with reviewed deployment settings before release.');
  for (const step of steps) {
    const result = spawnSync('pnpm', ['run', step], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: releaseEnvironment(),
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) {
      console.error(`Release verification stopped at ${step}.`);
      process.exit(result.status || 1);
    }
  }
}
