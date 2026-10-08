import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { address } from "../../src/domain.mjs";
const block = (number, parentHash, events = []) => ({
  number,
  hash: "0x" + (number + 100).toString(16),
  parentHash,
  timestamp: 100 + number,
  events,
  sources: [address("9")],
  sourceStarts: { [address("9")]: 1 },
});
const transfer = (id, to) => ({
  type: "transfer",
  collection: address("9"),
  tokenId: id,
  from: address("0"),
  to: address(to),
  transactionHash: "0xab",
  eventIndex: 0,
});
test("PostgreSQL commits blocks, token projection and progress together; failed blocks roll back and rewind preserves app data", async (t) => {
  const db = await testDatabase(t);
  const pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.bindIdentity({ chainId: "0x1", marketplace: address("99") });
  await store.applyBlock(
    block(1, "0x0", [transfer((2n ** 255n).toString(), "2")]),
  );
  assert.equal(
    (await store.get("token", `${address("9")}:${2n ** 255n}`)).owner,
    address("2"),
  );
  assert.equal((await store.get("progress", address("9"))).startBlock, 1);
  await assert.rejects(
    store.applyBlock(
      block(2, "0x65", [transfer("2", "3"), { type: "invalid" }]),
    ),
  );
  assert.equal((await store.head()).number, 1);
  assert.equal(await store.get("token", `${address("9")}:2`), null);
  await store.applyBlock(
    block(2, "0x65", [transfer((2n ** 255n).toString(), "3")]),
  );
  await pool.query(
    "INSERT INTO app.app_meta(key,value) VALUES('verification:test','{\"verified\":true}')",
  );
  await store.rewind(1);
  assert.equal(
    (await store.get("token", `${address("9")}:${2n ** 255n}`)).owner,
    address("2"),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT value FROM app.app_meta WHERE key='verification:test'",
      )
    ).rows[0].value.verified,
    true,
  );
  await assert.rejects(
    store.bindIdentity({ chainId: "0x2", marketplace: address("99") }),
    /identity/i,
  );
});
test("PostgreSQL snapshots hold one connection; a second scanner cannot acquire the same deployment lease", async (t) => {
  const db = await testDatabase(t);
  const pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool),
    other = new PgStore(pool);
  const release = await store.acquireIndexerLease();
  await assert.rejects(other.acquireIndexerLease(), /writer|scanner|lease/i);
  await release();
  const release2 = await other.acquireIndexerLease();
  await release2();
  await store.put("config", "marketplace", { feeBps: 200 });
  const snapshot = await store.beginSnapshot();
  assert.equal((await snapshot.get("config", "marketplace")).feeBps, 200);
  await store.put("config", "marketplace", { feeBps: 500 });
  assert.equal((await snapshot.get("config", "marketplace")).feeBps, 200);
  await snapshot.endSnapshot();
  assert.equal((await store.get("config", "marketplace")).feeBps, 500);
});

test("PostgreSQL core columns reject fractional or out-of-range chain integers instead of rounding them", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  const order = {
    id: "order",
    kind: "listing",
    state: "open",
    maker: address("2"),
    nonce: "1",
    collection: address("9"),
    tokenId: "1",
    currency: address("8"),
    buyerDebit: "1.5",
    expiry: "9999999999",
    feeBps: 500,
  };
  await assert.rejects(store.put("order", "order", order));
  await assert.rejects(
    store.put("order", "order", {
      ...order,
      buyerDebit: (2n ** 256n).toString(),
    }),
  );
  assert.equal(await store.get("order", "order"), null);
});
