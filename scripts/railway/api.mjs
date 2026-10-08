import { spawnSync } from 'node:child_process';
export const PROJECT_ID = '554683c6-4840-40d5-a60b-864d7d1f4c25';
export function railwayApi(query, variables) {
  const result=spawnSync('railway',['api',query,'--variables','@-','--compact'],{input:JSON.stringify(variables),encoding:'utf8',timeout:60000});
  if (result.status !== 0) throw new Error('Railway request failed. Check CLI login and project access; secret-bearing output was not printed.');
  const response=JSON.parse(result.stdout);
  if (response.errors?.length) throw new Error('Railway rejected the request.');
  return response.data;
}
export function railwayTarget(environment, service) {
  if (!['staging','production'].includes(environment)) throw new Error('Choose staging or production explicitly.');
  const data=railwayApi('query($id:String!){project(id:$id){environments{edges{node{id name}}}services{edges{node{id name}}}}}',{id:PROJECT_ID});
  const target=data.project.environments.edges.find(({node})=>node.name===environment)?.node;
  if (!target) throw new Error('Railway environment not found.');
  const serviceId=service ? data.project.services.edges.find(({node})=>node.name===service)?.node.id : undefined;
  if (service && !serviceId) throw new Error('Railway service not found.');
  return {...target,serviceId};
}
