import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { railwayApi, railwayTarget } from './api.mjs';
const guard=JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../infra/railway/edge-rules.json'))).rules[0];
export function mergeEdgeRules(current) {
  if (current && current.version !== 1) throw new Error('Review the existing edge-rules version before updating.');
  const rules=current?.rules??[];
  const owned=rules.find(rule=>rule.description===guard.description);
  const others=rules.filter(rule=>rule.description!==guard.description).sort((a,b)=>a.priority-b.priority);
  return {version:1,rules:[{...guard,...(owned?.id?{id:owned.id}:{}),priority:0},...others.map((rule,i)=>({...rule,priority:(i+1)*10}))]};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [environment]=process.argv.slice(2).filter(arg=>arg!=='--');
    const target=railwayTarget(environment,'web');
    const identity={serviceId:target.serviceId,environmentId:target.id};
    const current=railwayApi('query($s:String!,$e:String!){serviceInstance(serviceId:$s,environmentId:$e){edgeConfig{edgeRules}}}',{s:identity.serviceId,e:identity.environmentId});
    const edgeRules=mergeEdgeRules(current.serviceInstance.edgeConfig?.edgeRules);
    const input={...identity,edgeRules};
    const validation=railwayApi('query($input:ValidateServiceEdgeRulesInput!){validateServiceEdgeRules(input:$input){__typename}}',{input});
    if(validation.validateServiceEdgeRules.length)throw new Error('Railway rejected the proposed rules. Existing rules were not changed.');
    railwayApi('mutation($input:UpdateServiceEdgeRulesInput!){updateServiceEdgeRules(input:$input){id}}',{input});
    console.log(`Applied ingress identity protection to ${environment}; other edge rules preserved.`);
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
