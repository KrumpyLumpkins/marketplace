import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Store } from "../../src/store.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { testDatabase } from "./helpers.mjs";
import {
  importSqlite,
  verifySqliteImport,
} from "../../src/postgres/import-sqlite.mjs";
import { address } from "../../src/domain.mjs";
test("SQLite import preserves checkpoint, complete projections, raw/undo history, sessions, moderation and media; mismatches fail without replacing existing data", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "market-pg-import-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const chainPath = join(dir, "chain.sqlite"),
    appPath = chainPath + ".app",
    assetDir = join(dir, "assets");
  mkdirSync(assetDir);
  const source = new Store(chainPath);
  const identity = { chainId: "0x1", marketplace: address("99") };
  source.bindIdentity(identity);
  source.put("collection", address("9"), {
    address: address("9"),
    name: "Realms",
  });
  source.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    sources: [address("9")],
    sourceStarts: { [address("9")]: 1 },
    events: [
      {
        type: "transfer",
        collection: address("9"),
        tokenId: "9007199254740993",
        from: address("0"),
        to: address("2"),
      },
    ],
  });
  const id = `${address("9")}:9007199254740993`;
  source.put("token", id, {
    ...source.get("token", id),
    metadata: { name: "Realm" },
    attributes: [{ name: "Power", value: 99 }],
  });
  source.app.prepare("INSERT INTO app_meta VALUES(?,?)").run("flag", "true");
  source.app
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run("session-hash", address("2"), 4000000000);
  source.app
    .prepare("INSERT INTO moderation VALUES(?,?)")
    .run(address("8"), '{"reason":"operator decision"}');
  source.app
    .prepare("INSERT INTO notifications VALUES(?,?,?,?,?,?)")
    .run("historical", address("2"), '{"message":"keep read state"}', 1, 0, 1);
  const bytes = Buffer.from("owned media bytes"),
    name = createHash("sha256").update(bytes).digest("hex") + ".png";
  writeFileSync(join(assetDir, name), bytes);
  source.close();
  const db = await testDatabase(t),
    pool = db.pool();
  const result = await importSqlite({
    pool,
    chainPath,
    appPath,
    assetDir,
    identity,
    sourceFrozen: true,
  });
  assert.equal(result.verified, true);
  const store = new PgStore(pool);
  assert.equal((await store.head()).hash, "0x1");
  assert.equal((await store.get("token", id)).metadata.name, "Realm");
  assert.deepEqual(await store.asset(name), bytes);
  assert.equal(
    (await pool.query("SELECT token_hash FROM app.sessions")).rows[0]
      .token_hash,
    "session-hash",
  );
  assert.equal((await store.notifications("2"))[0].read, true);
  await assert.rejects(
    importSqlite({
      pool,
      chainPath,
      appPath,
      assetDir,
      identity,
      sourceFrozen: true,
    }),
    /empty|already/i,
  );
  await pool.query("UPDATE app.sessions SET account='changed'");
  await assert.rejects(
    verifySqliteImport({ pool, chainPath, appPath, assetDir }),
    /digest|mismatch/i,
  );
});

test("an unindexed staging source can bind its explicit registry identity without losing application state", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "market-pg-staging-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const chainPath = join(dir, "chain.sqlite");
  const source = new Store(chainPath);
  source.app
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run("staging-session", address("2"), 4000000000);
  source.close();
  const db = await testDatabase(t),
    pool = db.pool(),
    identity = { chainId: "0x534e5f5345504f4c4941", marketplace: null };
  const result = await importSqlite({
    pool,
    chainPath,
    identity,
    sourceFrozen: true,
  });
  assert.equal(result.verified, true);
  assert.equal(
    (await pool.query("SELECT value FROM chain.meta WHERE key='identity'"))
      .rows[0].value.chainId,
    identity.chainId,
  );
  assert.equal(
    (await verifySqliteImport({ pool, chainPath, identity })).verified,
    true,
  );
});
