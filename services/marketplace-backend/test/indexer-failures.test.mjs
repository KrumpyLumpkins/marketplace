import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { scanOnce } from '../src/indexer.mjs';
import { SELECTORS } from '../src/decode.mjs';
import { address } from '../src/domain.mjs';

const realms = JSON.parse(readFileSync(new URL('../../../config/marketplace/registry.realms.json', import.meta.url))).chains.SN_MAIN.collections[0];
// Synthetic fork/failure fixtures use the launch address, not invented mainnet evidence.
const config = { chain: 'SN_MAIN', chainId: '0x534e5f4d41494e', marketplace: null, collections: [{ ...realms, startBlock: 7 }] };
const raw = { from_address: realms.address, keys: [SELECTORS.Transfer], data: ['0x0', '0x2', '0x1', '0x0'] };
function fixture({ top = 7, fork = 0 } = {}) {
  const block = n => ({ block_number: n, block_hash: `0x${(100 + n + (n >= 8 ? fork : 0)).toString(16)}`, parent_hash: `0x${(99 + n + (n > 8 ? fork : 0)).toString(16)}`, timestamp: 1000 + n, status: 'ACCEPTED_ON_L2', transactions: [] });
  const event = n => ({ ...raw, data: ['0x0', n === 7 ? '0x2' : fork ? '0x4' : '0x3', '0x1', '0x0'], block_number: n, block_hash: block(n).block_hash, transaction_hash: `0x${(200+n).toString(16)}` });
  const rpc = { urls: ['https://primary.invalid'], async call(method, params, options) {
    if (method === 'starknet_chainId') return config.chainId;
    if (method === 'starknet_getEvents') {
      assert.equal(options.endpoint, rpc.urls[0]);
      return { events: Array.from({ length: params.filter.to_block.block_number - params.filter.from_block.block_number + 1 }, (_, i) => event(params.filter.from_block.block_number + i)) };
    }
    const n = params.block_id === 'latest' ? top : params.block_id.block_number;
    const b = block(n);
    if (method === 'starknet_getBlockWithReceipts') b.transactions = [{ transaction: { transaction_hash: event(n).transaction_hash }, receipt: { transaction_hash: event(n).transaction_hash, execution_status: 'SUCCEEDED', events: [event(n)] } }];
    return b;
  } };
  return rpc;
}
function alter(rpc, fn) { const original = rpc.call.bind(rpc); rpc.call = async (...args) => fn(args[0], args[1], args[2], await original(...args)); return rpc; }
async function fails(rpc, code) {
  const store = new Store(':memory:');
  try {
    await assert.rejects(scanOnce(store, rpc, config, { window: 1 }), { code });
    assert.equal(store.head(), null);
    assert.equal(store.get('progress', address(realms.address)), null);
    assert.equal(store.get('status', 'rpc').identityVerified, false);
  } finally { store.close(); }
}

test('missing all filtered events is detected even outside the old 32-block receipt sample', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getEvents' ? { events: [] } : r), 'EVENT_COVERAGE');
});
test('wrong receipt block height cannot advance the requested checkpoint', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getBlockWithReceipts' ? { ...r, block_number: 8 } : r), 'INVALID_RPC_BLOCK');
});
test('unaccepted receipt blocks are rejected', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getBlockWithReceipts' ? { ...r, status: 'PRE_CONFIRMED' } : r), 'INVALID_RPC_BLOCK');
});
test('duplicate filtered events are rejected rather than projected twice', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getEvents' ? { events: [...r.events,...r.events] } : r), 'EVENT_COVERAGE');
});
test('repeated pagination cursors cannot loop or checkpoint a partial range', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getEvents' ? { events: [], continuation_token: 'same' } : r), 'RPC_CURSOR_LOOP');
});
test('a page acquisition outage leaves the range retryable', async () => {
  const rpc = alter(fixture(), (m,p,o,r) => { if(m === 'starknet_getEvents') throw Object.assign(new Error('outage'),{code:'RPC_UNAVAILABLE'}); return r; });
  await fails(rpc, 'RPC_UNAVAILABLE');
});
test('changed anchor during pagination is rejected', async () => {
  let anchors = 0;
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getBlockWithTxHashes' && p.block_id !== 'latest' && ++anchors > 1 ? { ...r, block_hash: '0xffff' } : r), 'CHAIN_CONFLICT');
});
test('a changed anchor while fetching receipts is rejected', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getBlockWithReceipts' ? { ...r, block_hash: '0xffff' } : r), 'CHAIN_CONFLICT');
});
test('out-of-range filtered events are rejected', async () => {
  await fails(alter(fixture(), (m,p,o,r) => m === 'starknet_getEvents' ? { events: [{ ...r.events[0], block_number: 99 }] } : r), 'INVALID_RPC_EVENTS');
});
test('missing and conflicting receipt identities are rejected', async () => {
  for (const conflict of [false, true]) await fails(alter(fixture(), (m,p,o,r) => {
    if(m === 'starknet_getBlockWithReceipts') {
      if(conflict) r.transactions[0].transaction.transaction_hash='0xffff';
      else { delete r.transactions[0].receipt.transaction_hash;delete r.transactions[0].transaction.transaction_hash; }
    } return r;
  }), 'INVALID_RECEIPT');
});
test('reorg discovery rewinds the old suffix and indexes the new owner', async () => {
  const store = new Store(':memory:');
  try {
    await scanOnce(store, fixture({top:8}), config, {window:2});
    assert.equal(store.list('token')[0].owner, address('3'));
    const generation = store.generation();
    await scanOnce(store, fixture({top:8,fork:1000}), config, {window:2});
    assert.equal(store.list('token')[0].owner, address('4'));
    assert.ok(store.generation() > generation);
    assert.equal(store.get('progress', address(realms.address)).hash, store.head().hash);
  } finally { store.close(); }
});
test('restart resumes from the last committed block after a later receipt failure', async () => {
  const dir = mkdtempSync(join(tmpdir(),'realms-resume-')), path=join(dir,'chain.sqlite');
  let store = new Store(path);
  try {
    const broken = alter(fixture({top:8}), (m,p,o,r) => {
      if(m === 'starknet_getBlockWithReceipts' && p.block_id.block_number===8) delete r.transactions[0].receipt.events;
      return r;
    });
    await assert.rejects(scanOnce(store, broken, config, {window:2}), {code:'INVALID_RECEIPT'});
    assert.equal(store.head().number,7);
    store.close(); store=new Store(path);
    await scanOnce(store, fixture({top:8}), config, {window:2});
    assert.equal(store.head().number,8);
    assert.equal(store.list('token')[0].owner,address('3'));
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,2);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
