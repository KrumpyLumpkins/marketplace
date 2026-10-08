import { describe, it, expect } from 'vitest';
import { mergeEdgeRules } from './edge-rules.mjs';
describe('Railway ingress identity policy', () => {
  it('blocks supplied identity before terminal allow rules and preserves other rules', () => {
    const other={id:'rul_custom',priority:0,enabled:true,if:{attr:'http.path',op:'eq',value:'/public'},then:{action:'allow'}};
    const result=mergeEdgeRules({version:1,rules:[other]});
    expect(result.rules[0].if).toMatchObject({attr:'http.header',key:'x-real-ip',op:'matches',value:'*'});
    expect(result.rules[0].then).toMatchObject({action:'block',params:{status:403}});
    expect(result.rules[1]).toEqual({...other,priority:10});
    expect(mergeEdgeRules(result)).toEqual(result);
  });
});
