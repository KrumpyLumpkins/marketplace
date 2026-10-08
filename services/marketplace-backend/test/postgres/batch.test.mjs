import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { address } from "../../src/domain.mjs";
const source = address("9");
const block = (n) => ({
  number: n,
  hash: "0x" + n.toString(16),
  parentHash: "0x" + (n - 1).toString(16),
  timestamp: n,
  events: [],
  sources: [source],
  sourceStarts: { [source]: 1 },
  observedAt: 100 + n,
});
async function fixture(t) {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  return { pool, store: new PgStore(pool) };
}
test("bulk empty blocks preserve every header and rewind checkpoint with bounded SQL work", async (t) => {
  const { store, pool } = await fixture(t);
  let queries = 0;
  const query = store.query.bind(store);
  store.query = (...args) => {
    queries++;
    return query(...args);
  };
  await store.applyBlocks(Array.from({ length: 1000 }, (_, i) => block(i + 1)));
  assert.ok(queries < 30, `expected bounded round trips, got ${queries}`);
  assert.equal((await store.head()).number, 1000);
  assert.equal((await store.get("progress", source)).startBlock, 1);
  assert.equal(
    (await pool.query("SELECT COUNT(*) FROM chain.blocks")).rows[0].count,
    "1000",
  );
  await store.rewind(517);
  assert.deepEqual(await store.get("progress", source), {
    source,
    startBlock: 1,
    block: 517,
    hash: block(517).hash,
    observedAt: 617,
  });
  await store.applyBlocks(
    Array.from({ length: 483 }, (_, i) => block(i + 518)),
  );
  assert.equal((await store.head()).number, 1000);
  await store.applyBlocks([block(999), block(1000)]);
  assert.equal((await store.head()).number, 1000);
});
test("a broken bulk block chain rolls back the entire batch including progress", async (t) => {
  const { store } = await fixture(t);
  await store.applyBlock(block(1));
  await assert.rejects(
    store.applyBlocks([block(2), { ...block(3), parentHash: "0x99" }]),
    /extend|gap/i,
  );
  assert.equal((await store.head()).number, 1);
  assert.equal((await store.get("progress", source)).block, 1);
});
test("bulk processing retains event projections, newly activated sources and expiry floor changes", async (t) => {
  const { store } = await fixture(t),
    second = address("10");
  await store.put("token", `${source}:1`, {
    id: `${source}:1`,
    collection: source,
    tokenId: "1",
    owner: address("2"),
  });
  await store.put("order", "order", {
    id: "order",
    kind: "listing",
    state: "open",
    maker: address("2"),
    nonce: "1",
    collection: source,
    tokenId: "1",
    currency: address("8"),
    buyerDebit: "100",
    expiry: "3",
    feeBps: 500,
  });
  await store.applyBlocks([
    block(1),
    {
      ...block(2),
      sources: [source, second],
      sourceStarts: { [source]: 1, [second]: 2 },
    },
    block(3),
  ]);
  const floors = await store.list("floor_history");
  assert.deepEqual(
    floors.map((f) => [f.block, f.price]),
    [
      [1, "100"],
      [3, null],
    ],
  );
  assert.equal((await store.get("progress", second)).startBlock, 2);
  await store.rewind(1);
  assert.equal(await store.get("progress", second), null);
});

test("mixed empty and event blocks retain ownership and rewind history", async (t) => {
  const { store } = await fixture(t),
    transfer = (to) => ({
      type: "transfer",
      collection: source,
      tokenId: "1",
      from: address("0"),
      to: address(to),
    });
  await store.applyBlocks([
    { ...block(1), events: [transfer("2")] },
    block(2),
    block(3),
    { ...block(4), events: [transfer("3")] },
    block(5),
  ]);
  assert.equal((await store.get("token", `${source}:1`)).owner, address("3"));
  await store.rewind(2);
  assert.equal((await store.get("token", `${source}:1`)).owner, address("2"));
  assert.equal((await store.get("progress", source)).block, 2);
  await assert.rejects(
    store.applyBlocks([
      block(3),
      { ...block(4), events: [{ type: "invalid" }] },
    ]),
  );
  assert.equal((await store.head()).number, 2);
});
