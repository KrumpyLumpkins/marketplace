import { fileURLToPath } from 'node:url';
import { hiddenInput } from '../configuration/hidden-input.mjs';
import { PROJECT_ID as PROJECT, railwayApi as api, railwayTarget } from './api.mjs';
const KEYS = ['PUBLIC_ORIGIN','OPERATOR_TOKEN','STARKNET_RPC_URL','STARKNET_RPC_FALLBACK_URL','MARKETPLACE_REGISTRY_JSON','MARKETPLACE_BACKGROUND_ENABLED','MARKETPLACE_FAST_HISTORY_ENABLED','MARKETPLACE_ADDRESS','MARKETPLACE_COLLECTIONS'];
export function variableInput(projectId, environmentId, name, value) {
  if (/PRIVATE_KEY|SIGNER/.test(name)) throw new Error('Signing keys must stay local. Use pnpm contracts:env.');
  if (!KEYS.includes(name)) throw new Error(`Choose one of: ${KEYS.join(', ')}`);
  if (['MARKETPLACE_BACKGROUND_ENABLED','MARKETPLACE_FAST_HISTORY_ENABLED'].includes(name) && !['true','false'].includes(value)) throw new Error('Use true or false.');
  if (name === 'MARKETPLACE_REGISTRY_JSON' && value) {
    const registry=JSON.parse(value);
    if (registry.schemaVersion !== 1 || !registry.chains) throw new Error('Use a generated version-1 deployment registry.');
  }
  if (['STARKNET_RPC_URL','STARKNET_RPC_FALLBACK_URL'].includes(name) && value && !['http:','https:'].includes(new URL(value).protocol)) throw new Error('Use an HTTP(S) RPC URL.');
  if (name === 'PUBLIC_ORIGIN' && (new URL(value).protocol !== 'https:' || new URL(value).origin !== value)) throw new Error('Use the exact HTTPS frontend origin without a trailing slash.');
  if (name === 'OPERATOR_TOKEN' && value.length < 32) throw new Error('Use a unique random operator secret of at least 32 characters.');
  return { projectId, environmentId, name, value, skipDeploys: true };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [environment,name] = process.argv.slice(2).filter(arg => arg !== '--');
    if (!['staging','production'].includes(environment) || !name) throw new Error('Usage: pnpm railway:variable staging|production VARIABLE_NAME');
    if (!KEYS.includes(name)) variableInput(PROJECT,'',name,'');
    const target=railwayTarget(environment);
    const value=await hiddenInput(`${name} for ${environment} (hidden): `);
    const result=api('mutation($input:VariableUpsertInput!){variableUpsert(input:$input)}',{input:variableInput(PROJECT,target.id,name,value)});
    if (!result.variableUpsert) throw new Error('Variable update was not accepted.');
    console.log(`Updated ${name} in ${environment}. No deployment triggered.`);
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
