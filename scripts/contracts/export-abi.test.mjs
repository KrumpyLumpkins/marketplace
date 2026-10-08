import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

it('regenerating unchanged artifacts retains the recorded production deployment', () => {
  mkdirSync('.context', { recursive: true });
  const dir = mkdtempSync('.context/export-abi-test-');
  try {
    mkdirSync(join(dir, 'scripts/contracts'), { recursive: true });
    mkdirSync(join(dir, 'contracts/marketplace/target/dev'), { recursive: true });
    mkdirSync(join(dir, 'contracts/marketplace/src'), { recursive: true });
    cpSync('scripts/contracts/export-abi.mjs', join(dir, 'scripts/contracts/export-abi.mjs'));
    // Minimal hashable artifacts keep this file-persistence regression independent
    // of a local Cairo compiler/build; production artifact identity has separate checks.
    writeFileSync(join(dir, 'contracts/marketplace/src/lib.cairo'), '// export fixture\n');
    const entries = { EXTERNAL: [], L1_HANDLER: [], CONSTRUCTOR: [] };
    writeFileSync(join(dir, 'contracts/marketplace/target/dev/biblio_marketplace_Marketplace.contract_class.json'), JSON.stringify({
      sierra_program: [], contract_class_version: '0.1.0', entry_points_by_type: entries, abi: [],
    }));
    writeFileSync(join(dir, 'contracts/marketplace/target/dev/biblio_marketplace_Marketplace.compiled_contract_class.json'), JSON.stringify({
      bytecode: [], entry_points_by_type: entries,
    }));
    const manifestPath = join(dir, 'contracts/marketplace/artifact-manifest.json');
    execFileSync(process.execPath, [join(dir, 'scripts/contracts/export-abi.mjs')]);
    const manifest = JSON.parse(readFileSync(manifestPath));
    const deployment = { network: 'SN_MAIN', address: '0x123', record: 'config/marketplace/deployment.mainnet.json' };
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, productionDeployment: deployment }));
    execFileSync(process.execPath, [join(dir, 'scripts/contracts/export-abi.mjs')]);
    expect(JSON.parse(readFileSync(manifestPath)).productionDeployment).toEqual(deployment);
    // A different class must never inherit the former deployment's address.
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, classHash: '0x1', productionDeployment: deployment }));
    execFileSync(process.execPath, [join(dir, 'scripts/contracts/export-abi.mjs')]);
    expect(JSON.parse(readFileSync(manifestPath)).productionDeployment).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);
