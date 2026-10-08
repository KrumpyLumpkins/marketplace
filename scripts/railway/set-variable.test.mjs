import { describe, it, expect } from 'vitest';
import { variableInput } from './set-variable.mjs';
describe('Railway shared variable updates', () => {
  it('uses environment-scoped shared variables without triggering deployment', () => {
    expect(variableInput('project','environment','STARKNET_RPC_URL','https://rpc.example')).toEqual({projectId:'project',environmentId:'environment',name:'STARKNET_RPC_URL',value:'https://rpc.example',skipDeploys:true});
  });
  it('keeps signing keys local and rejects accidental unsupported inputs', () => {
    expect(()=>variableInput('p','e','DEPLOYMENT_SIGNER_PRIVATE_KEY','0x1')).toThrow(/local/);
    expect(()=>variableInput('p','e','MARKETPLACE_BACKGROUND_ENABLED','yes')).toThrow(/true or false/);
    expect(()=>variableInput('p','e','MARKETPLACE_REGISTRY_JSON','broken')).toThrow();
  });
});
