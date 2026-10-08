import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { createApi } from "../src/api.mjs";
import { address } from "../src/domain.mjs";
test("HTTP routes serve owned data, enforce authentication/origin, and bound bodies", async (t) => {
  const s = new Store(":memory:");
  s.put("collection", address("9"), { address: address("9"), name: "Realms" });
  const api = createApi({
    store: s,
    config: {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: null,
      collections: [{ address: "9" }],
      currencies: [],
      origin: "http://localhost:3000",
    },
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
    s.close();
  });
  const root = `http://127.0.0.1:${api.address().port}`;
  let r = await fetch(root + "/v1/chains/LOCAL/collections");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data[0].name, "Realms");
  r = await fetch(root + "/v1/chains/LOCAL/notifications");
  assert.equal(r.status, 401);
  r = await fetch(root + "/v1/chains/SN_MAIN/collections");
  assert.equal(r.status, 400);
  r = await fetch(root + "/v1/chains/LOCAL/reports", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  r = await fetch(root + "/v1/chains/LOCAL/orders/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orders: Array(26).fill({ maker: "1", nonce: "1" }),
    }),
  });
  assert.equal(r.status, 400);
});
test("wallet RPC relay permits required wallet calls and rejects unrelated methods", async (t) => {
  const s = new Store(":memory:");
  const calls = [];
  const api = createApi({
    store: s,
    config: { chain: "LOCAL", chainId: "0x1", collections: [], currencies: [] },
    rpc: {
      call: async (method, params) => {
        calls.push({ method, params });
        return "0x1";
      },
    },
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
    s.close();
  });
  const url = `http://127.0.0.1:${api.address().port}/rpc`;
  const post = (method) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method, params: [] }),
    });
  const allowed = await (await post("starknet_chainId")).json();
  assert.equal(allowed.result, "0x1");
  assert.equal(allowed.id, 3);
  const denied = await (await post("devnet_mint")).json();
  assert.equal(denied.error.code, -32601);
  assert.equal(calls.length, 1);
});
test("transaction reflection includes canonical governance events and is invalidated by rewind", async (t) => {
  const s = new Store(":memory:");
  s.applyBlock({
    number: 1,
    hash: "0x11",
    parentHash: "0x0",
    timestamp: 1,
    events: [
      {
        type: "initialized",
        version: 1,
        admin: address("2"),
        feeBps: 200,
        feeRecipient: address("4"),
        paused: false,
        transactionHash: "0xa",
      },
    ],
  });
  s.applyBlock({
    number: 2,
    hash: "0x12",
    parentHash: "0x11",
    timestamp: 2,
    events: [
      { type: "trading_changed", paused: true, transactionHash: "0xb" },
      { type: "fee_policy_changed", feeBps: 300, feeRecipient: address("6"), transactionHash: "0x10" },
      {
        type: "collection_policy",
        address: address("9"),
        enabled: true,
        royalties: true,
        transactionHash: "0xc",
      },
      {
        type: "currency_policy",
        address: address("3"),
        enabled: true,
        transactionHash: "0xd",
      },
      { type: "admin_proposed", admin: address("5"), transactionHash: "0xe" },
      {
        type: "admin_transferred",
        previous: address("2"),
        admin: address("5"),
        transactionHash: "0xf",
      },
    ],
  });
  const api = createApi({
    store: s,
    config: {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: "0x9",
      collections: [],
      currencies: [],
    },
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
    s.close();
  });
  const get = async (hash) =>
    (
      await (
        await fetch(
          `http://127.0.0.1:${api.address().port}/v1/chains/LOCAL/transactions/${hash}`,
        )
      ).json()
    ).data;
  for (const hash of ["0xa", "0xb", "0xc", "0xd", "0xe", "0xf", "0x10"])
    assert.equal((await get(hash)).reflected, true, hash);
  assert.equal((await get("0x999?block=2")).reflected, false);
  s.rewind(1);
  assert.equal((await get("0xb")).reflected, false);
  assert.equal((await get("0x10")).reflected, false);
  assert.equal((await get("0xa")).reflected, true);
});

test('trusted proxy visitors have independent quotas and cannot throttle health probes', async (t) => {
  const store = new Store(':memory:');
  const api = createApi({ store, config: { chain: 'LOCAL', chainId: '0x1', collections: [], currencies: [], trustedProxyAddresses: ['127.0.0.1'] } });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => { api.closeAllConnections(); api.close(); store.close(); });
  const base = `http://127.0.0.1:${api.address().port}`;
  const visitor = ip => fetch(base + '/v1/chains/LOCAL/collections', { headers: { 'x-real-ip': ip } });
  for (let i = 0; i < 300; i++) assert.equal((await visitor('203.0.113.1')).status, 200);
  assert.equal((await visitor('203.0.113.1')).status, 429);
  assert.equal((await visitor('203.0.113.2')).status, 200);
  assert.equal((await fetch(base + '/health/live', { headers: { 'x-real-ip': '203.0.113.1' } })).status, 200);
});
