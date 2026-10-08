import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { scanOnce } from "../../src/indexer.mjs";
import { SELECTORS } from "../../src/decode.mjs";
import { address } from "../../src/domain.mjs";
import {
  REALMS_HISTORY_PROFILE as profile,
  reconcileHistory,
} from "../../src/history.mjs";
import { marketStatus } from "../../src/status.mjs";
const config = {
  chain: "SN_MAIN",
  chainId: "0x534e5f4d41494e",
  marketplace: address("99"),
  marketplaceStartBlock: 10000,
  collections: [{ ...profile, startBlock: 1 }],
  currencies: [],
};
const header = (n) => ({
  block_number: n,
  block_hash: "0x" + n.toString(16),
  parent_hash: "0x" + (n - 1).toString(16),
  timestamp: n,
  status: "ACCEPTED_ON_L1",
  transactions: [],
});
const event = {
  from_address: profile.address,
  keys: [SELECTORS.Transfer],
  data: ["0", "0x2", "1", "0"],
};
function rpcFixture() {
  const receipts = [];
  return {
    receipts,
    call: async (m, p) => {
      if (m === "starknet_chainId") return config.chainId;
      if (m === "starknet_getClassHashAt") return profile.classHash;
      if (m === "starknet_getEvents")
        return {
          events:
            p.filter.from_block.block_number <= 500 &&
            p.filter.to_block.block_number >= 500
              ? [
                  {
                    ...event,
                    block_number: 500,
                    block_hash: "0x1f4",
                    transaction_hash: "0xaa",
                  },
                ]
              : [],
        };
      const n = p.block_id === "latest" ? 20000 : p.block_id.block_number,
        b = header(n);
      if (m === "starknet_getBlockWithReceipts") {
        receipts.push(n);
        if (n === 500)
          b.transactions = [
            {
              transaction: { transaction_hash: "0xaa" },
              receipt: {
                transaction_hash: "0xaa",
                execution_status: "SUCCEEDED",
                events: [event],
              },
            },
          ];
      }
      return b;
    },
    contract: async (_, selector) =>
      selector === profile.supplySelector
        ? ["1", "0"]
        : selector === SELECTORS.owner_of
          ? ["0x2"]
          : ["0"],
  };
}
test("fast history verifies returned event receipts, stores a sparse range and requires a pinned reconciliation", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    events: [],
    sources: [profile.address],
    sourceStarts: { [profile.address]: 1 },
  });
  const rpc = rpcFixture();
  const r = await scanOnce(store, rpc, config, {
    fastHistory: true,
    historyWindow: 100000,
  });
  assert.equal(r.indexed, 9999);
  assert.deepEqual(
    rpc.receipts.sort((a, b) => a - b),
    [500, 9999],
  );
  assert.equal(
    (await pool.query("SELECT COUNT(*) FROM chain.blocks")).rows[0].count,
    "3",
  );
  let history = await store.get("status", "history");
  assert.equal(history.state, "pending");
  for (let n = 0; n < 5 && history.state !== "passed"; n++) {
    await reconcileHistory(store, rpc, config, history);
    history = await store.get("status", "history");
  }
  assert.equal(history.state, "passed");
  assert.equal(history.checkedTokens, 1);
});
test("history readiness is blocked by missing reconciliation even when the live market is otherwise ready", () => {
  const ready = {
    head: { number: 100 },
    rpc: { head: 100, observedAt: Date.now(), identityVerified: true },
    cfg: { paused: false },
    progress: [{ startBlock: 1, block: 100 }],
    generation: 1,
    history: { state: "pending" },
  };
  const c = {
    collections: [{ address: "9", startBlock: 1 }],
    marketplace: "0x99",
    marketplaceStartBlock: 1,
  };
  ready.progress.push({ startBlock: 1, block: 100 });
  assert.equal(
    marketStatus(c, { ...ready, history: undefined }).safeForCheckout,
    true,
  );
  const status = marketStatus(c, ready);
  assert.deepEqual(status.reasons, ["HISTORY_RECONCILIATION_REQUIRED"]);
});
test("on-chain supply or ownership disagreement cannot certify the historical snapshot", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock({
    number: 9999,
    hash: header(9999).block_hash,
    parentHash: header(9999).parent_hash,
    timestamp: 9999,
    events: [],
  });
  await store.put("token", `${profile.address}:1`, {
    id: `${profile.address}:1`,
    collection: profile.address,
    tokenId: "1",
    owner: address("3"),
    burned: false,
  });
  const rpc = rpcFixture(),
    state = { mode: "event_ranges", state: "pending", cutoff: 9999 };
  await assert.rejects(
    reconcileHistory(store, rpc, config, state),
    (e) => e.code === "HISTORY_OWNER_MISMATCH",
  );
  assert.equal((await store.get("status", "history")).state, "failed");
  rpc.contract = async () => ["2", "0"];
  await assert.rejects(
    reconcileHistory(store, rpc, config, state),
    (e) => e.code === "HISTORY_SUPPLY_MISMATCH",
  );
});

test("an entirely omitted historical event block is caught by the supply reconciliation gate", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    events: [],
    sources: [profile.address],
    sourceStarts: { [profile.address]: 1 },
  });
  const rpc = rpcFixture(),
    original = rpc.call;
  rpc.call = (m, ...args) =>
    m === "starknet_getEvents"
      ? Promise.resolve({ events: [] })
      : original(m, ...args);
  await scanOnce(store, rpc, config, {
    fastHistory: true,
    historyWindow: 100000,
  });
  assert.deepEqual(rpc.receipts, [9999]);
  await assert.rejects(
    reconcileHistory(store, rpc, config, await store.get("status", "history")),
    (e) => e.code === "HISTORY_SUPPLY_MISMATCH",
  );
  assert.equal((await store.get("status", "history")).state, "failed");
});
test("a reported historical event missing from its receipt rejects the entire range", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    events: [],
    sources: [profile.address],
    sourceStarts: { [profile.address]: 1 },
  });
  const rpc = rpcFixture(),
    original = rpc.call;
  rpc.call = async (m, ...args) => {
    const b = await original(m, ...args);
    if (m === "starknet_getBlockWithReceipts" && b.block_number === 500)
      b.transactions[0].receipt.events = [];
    return b;
  };
  await assert.rejects(
    scanOnce(store, rpc, config, { fastHistory: true }),
    (e) => e.code === "EVENT_COVERAGE",
  );
  assert.equal((await store.head()).number, 1);
});

test("disabling fast acquisition still stops at its pending reconciliation checkpoint", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    events: [],
    sources: [profile.address],
    sourceStarts: { [profile.address]: 1 },
  });
  await store.put("status", "history", {
    mode: "event_ranges",
    state: "pending",
    cutoff: 10,
  });
  const result = await scanOnce(store, rpcFixture(), config, {
    fastHistory: false,
    window: 100,
  });
  assert.equal(result.indexed, 10);
  assert.equal((await store.head()).number, 10);
});
