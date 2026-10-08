import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { cutoverCollections } from "../../src/postgres/onboarding.mjs";
test("collection cutover preserves application data and existing media, replaces projections atomically, and rejects stale evidence", async (t) => {
  const s = await testDatabase(t),
    d = await testDatabase(t),
    sp = s.pool(),
    dp = d.pool();
  await migrate(sp);
  await migrate(dp);
  const ss = new PgStore(sp),
    ds = new PgStore(dp);
  const identity = { chainId: "0x1", marketplace: "0x2" };
  for (const store of [ss, ds]) {
    await store.bindIdentity(identity);
    await store.applyBlock({
      number: 1,
      hash: "0x1",
      parentHash: "0x0",
      timestamp: 1,
      events: [],
      sources: ["0x3"],
      sourceStarts: { "0x3": 1 },
    });
  }
  await ss.applyBlock({
    number: 2,
    hash: "0x2",
    parentHash: "0x1",
    timestamp: 2,
    events: [],
    sources: ["0x3"],
    sourceStarts: { "0x3": 1 },
  });
  await ss.put("collection", "0x3", { address: "0x3", name: "Fixture" });
  await ss.put("status", "history", {
    state: "passed",
    cutoff: 1,
    completedCollections: [{ address: "0x3", supply: "0", checkedTokens: 0 }],
  });
  await dp.query("INSERT INTO chain.meta VALUES($1,$2)", [
    "import_provenance",
    { source: "legacy" },
  ]);
  await dp.query("INSERT INTO app.sessions VALUES ('saved','0x4',9999999999)");
  await dp.query("INSERT INTO media.assets VALUES ($1,'image/png',$2)", [
    "a".repeat(64) + ".png",
    Buffer.from("keep"),
  ]);
  await sp.query("INSERT INTO media.assets VALUES ($1,'image/png',$2)", [
    "b".repeat(64) + ".png",
    Buffer.from("new"),
  ]);
  await assert.rejects(
    cutoverCollections(sp, dp, { expectedSourceHash: "0x999" }),
    /checkpoint/,
  );
  assert.equal((await ds.head()).number, 1);
  const failingPool = {
    query: dp.query.bind(dp),
    connect: async () => {
      const client = await dp.connect();
      return new Proxy(client, {
        get(target, key) {
          if (key === "query")
            return (sql, ...args) => {
              if (sql.startsWith("INSERT INTO chain.blocks"))
                throw new Error("Injected copy failure");
              return target.query(sql, ...args);
            };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
  await assert.rejects(
    cutoverCollections(sp, failingPool, { expectedSourceHash: "0x2" }),
    /Injected copy failure/,
  );
  assert.equal((await ds.head()).number, 1);
  assert.equal(await ds.generation(), 1);
  const result = await cutoverCollections(sp, dp, {
    expectedSourceHash: "0x2",
  });
  assert.equal(result.head.number, "2");
  assert.equal(await ds.generation(), 2);
  assert.deepEqual(
    (
      await dp.query(
        "SELECT value FROM chain.meta WHERE key='import_provenance'",
      )
    ).rows[0].value,
    { source: "legacy" },
  );
  assert.equal(
    (await dp.query("SELECT count(*) FROM app.sessions")).rows[0].count,
    "1",
  );
  assert.equal(
    (await dp.query("SELECT count(*) FROM media.assets")).rows[0].count,
    "2",
  );
  assert.deepEqual(
    (await dp.query("SELECT bytes FROM media.assets ORDER BY name")).rows.map(
      (r) => r.bytes.toString(),
    ),
    ["keep", "new"],
  );
});
