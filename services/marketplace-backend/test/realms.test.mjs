import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeEvent } from '../src/decode.mjs';
import { address } from '../src/domain.mjs';
const config = JSON.parse(readFileSync(new URL('../../../config/marketplace/registry.realms.json', import.meta.url))).chains.SN_MAIN;
const fixture = JSON.parse(readFileSync(new URL('./fixtures/realms-transfers.json', import.meta.url)));

test('historical Realms keyed mint events decode into exact token owners', () => {
  const tokens = fixture.events.map(event => decodeEvent(event, config));
  assert.deepEqual(tokens.map(token => token.tokenId), ['1038', '1830', '1101']);
  for (const [i,token] of tokens.entries()) {
    assert.equal(token.type, 'transfer');
    assert.equal(token.collection, address(config.collections[0].address));
    assert.equal(token.from,address('0'));
    assert.equal(token.to,address(fixture.events[i].keys[2]));
  }
});
