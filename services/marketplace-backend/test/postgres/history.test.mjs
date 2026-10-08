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
});
test("sparse historical ranges commit event provenance and end checkpoints atomically, and rewind invalidates the whole intersected range", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock(block(1));
  const event = {
    type: "transfer",
    collection: source,
    tokenId: "1",
    from: address("0"),
    to: address("2"),
  };
  await store.applyEventRange({
    from: 2,
    to: 100,
    blocks: [{ ...block(45), events: [event] }, block(100)],
    cutoff: 100,
  });
  assert.equal((await store.head()).number, 100);
  assert.equal((await store.get("progress", source)).block, 100);
  assert.equal((await store.get("status", "history")).state, "pending");
  assert.equal(
    (await pool.query("SELECT count(*) FROM chain.blocks")).rows[0].count,
    "3",
  );
  await pool.query("INSERT INTO app.app_meta VALUES('keep','true')");
  await store.rewind(70);
  assert.equal((await store.head()).number, 1);
  assert.equal(await store.get("token", `${source}:1`), null);
  assert.equal((await store.get("progress", source)).block, 1);
  assert.equal(
    (await pool.query("SELECT count(*) FROM chain.history_ranges")).rows[0]
      .count,
    "0",
  );
  assert.equal(
    (await pool.query("SELECT value FROM app.app_meta")).rows[0].value,
    true,
  );
});
test("invalid range events roll back all sparse headers and checkpoints", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock(block(1));
  await assert.rejects(
    store.applyEventRange({
      from: 2,
      to: 100,
      blocks: [{ ...block(50), events: [{ type: "invalid" }] }, block(100)],
      cutoff: 100,
    }),
  );
  assert.equal((await store.head()).number, 1);
  assert.equal(
    (await pool.query("SELECT count(*) FROM chain.history_ranges")).rows[0]
      .count,
    "0",
  );
});

test("range reduction preserves repeated transfers, approvals and per-block entity undo with bounded SQL work", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock(block(1));
  let queries = 0;
  const original = store.query.bind(store);
  store.query = (...a) => {
    queries++;
    return original(...a);
  };
  const events = Array.from({ length: 1000 }, (_, i) => ({
    ...block(i + 2),
    events: [
      {
        type: "transfer",
        collection: source,
        tokenId: String(i % 100),
        from: address("0"),
        to: address(i < 500 ? "2" : "3"),
      },
    ],
  }));
  await store.applyEventRange({
    from: 2,
    to: 100000,
    blocks: [...events, block(100000)],
    cutoff: 100000,
  });
  assert.ok(queries < 35, `unbounded SQL work: ${queries}`);
  assert.equal((await store.get("token", `${source}:1`)).owner, address("3"));
  assert.equal((await store.list("activity")).length, 1000);
  await store.rewind(500);
  assert.equal((await store.head()).number, 1);
  assert.equal((await store.list("token")).length, 0);
});
