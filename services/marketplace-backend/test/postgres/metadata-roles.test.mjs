import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { provisionRoles } from "../../src/postgres/roles.mjs";
import { refreshMetadata } from "../../src/metadata.mjs";
import { address } from "../../src/domain.mjs";
const block = (n, owner) => ({
  number: n,
  hash: "0x" + n,
  parentHash: "0x" + (n - 1),
  timestamp: n,
  events: [
    {
      type: "transfer",
      collection: address("9"),
      tokenId: "1",
      from: address("0"),
      to: address(owner),
    },
  ],
});
const uriFelts = (raw) => {
  const bytes = Buffer.from(
    "data:application/json," + encodeURIComponent(JSON.stringify(raw)),
  );
  const words = [];
  let i = 0;
  for (; i + 31 <= bytes.length; i += 31)
    words.push("0x" + bytes.subarray(i, i + 31).toString("hex"));
  const pending = bytes.subarray(i);
  return [
    String(words.length),
    ...words,
    pending.length ? "0x" + pending.toString("hex") : "0",
    String(pending.length),
  ];
};
test("metadata completion cannot overwrite a transfer that occurred while its RPC request was in flight", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock(block(1, "2"));
  let entered;
  const ready = new Promise((r) => (entered = r));
  let release;
  const gate = new Promise((r) => (release = r));
  const rpc = {
    contract: async () => {
      entered();
      await gate;
      return uriFelts({ name: "Realm stale" });
    },
  };
  const work = refreshMetadata(store, rpc, { chain: "LOCAL" }, { limit: 1 });
  await ready;
  await store.applyBlock(block(2, "3"));
  release();
  await work;
  assert.equal(
    (await store.get("token", `${address("9")}:1`)).owner,
    address("3"),
  );
  assert.equal(
    (await store.get("token", `${address("9")}:1`)).metadata.name,
    undefined,
  );
  await assert.rejects(
    store.putMetadata(`${address("9")}:1`, { owner: address("4") }),
    /overwrite/,
  );
});
test("runtime roles isolate application data and chain ownership; metadata and HTTP share immutable media through PostgreSQL", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.applyBlock(block(1, "2"));
  const prefix = "r" + randomUUID().replaceAll("-", "").slice(0, 15);
  const roles = Object.fromEntries(
    ["api", "index", "metadata"].map((kind) => [
      kind,
      { name: prefix + "_" + kind, password: randomBytes(32).toString("hex") },
    ]),
  );
  await provisionRoles(pool, roles);
  // SET ROLE exercises privileges independently of local test-cluster trust authentication.
  for (const kind of ["index", "metadata"]) {
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE "${roles[kind].name}"`);
      await assert.rejects(
        client.query("SELECT * FROM app.sessions"),
        (e) => e.code === "42501",
      );
      if (kind === "metadata")
        await assert.rejects(
          client.query("UPDATE market.tokens SET body=body"),
          (e) => e.code === "42501",
        );
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  }
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE "${roles.api.name}"`);
    await assert.rejects(
      client.query("DELETE FROM chain.blocks"),
      (e) => e.code === "42501",
    );
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
  const bytes = Buffer.from("image fixture"),
    name = createHash("sha256").update(bytes).digest("hex") + ".png";
  await store.saveAsset(name, "image/png", bytes);
  assert.deepEqual(await store.asset(name), bytes);
  await assert.rejects(
    store.saveAsset("a".repeat(64) + ".png", "image/png", bytes),
    /Invalid/,
  );
  // Role ownership is cluster-wide; remove grants before dropping these test-only roles.
  for (const spec of Object.values(roles)) {
    await pool.query(`DROP OWNED BY "${spec.name}"`);
    await pool.query(`DROP ROLE "${spec.name}"`);
  }
});
