import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { saveDeploymentEnvironment } from './configure-env.mjs';

describe('local deployment credentials', () => {
  it('stores exact values with owner-only permissions and preserves unrelated settings', () => {
    const dir=mkdtempSync(join(tmpdir(),'market-credentials-')), file=join(dir,'.env.deployment');
    try {
      saveDeploymentEnvironment(file,{DEPLOYMENT_RPC_URL:'https://rpc.example/v1?key=abc#test',DEPLOYMENT_SIGNER_ADDRESS:'0x2',DEPLOYMENT_SIGNER_PRIVATE_KEY:'0x1',DEPLOYMENT_SIGNER_MODULE:'/local/signer.mjs'});
      saveDeploymentEnvironment(file,{DEPLOYMENT_SIGNER_PRIVATE_KEY:'0x3'});
      const saved=parseEnv(readFileSync(file,'utf8'));
      expect(saved.DEPLOYMENT_SIGNER_PRIVATE_KEY).toBe('0x3');
      expect(saved.DEPLOYMENT_SIGNER_MODULE).toBe('/local/signer.mjs');
      expect(saved.DEPLOYMENT_RPC_URL).toBe('https://rpc.example/v1?key=abc#test');
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(()=>saveDeploymentEnvironment(file,{DEPLOYMENT_SIGNER_PRIVATE_KEY:'not a key'})).toThrow(/private key/);
      expect(parseEnv(readFileSync(file,'utf8')).DEPLOYMENT_SIGNER_PRIVATE_KEY).toBe('0x3');
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
});
