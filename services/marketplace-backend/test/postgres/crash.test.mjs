import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
test("SIGKILL during a PostgreSQL transaction cannot expose a partial indexed block", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const code = `import pg from 'pg';const c=new pg.Client({connectionString:process.env.PG_TEST_CHILD_URL});await c.connect();await c.query('BEGIN');await c.query("INSERT INTO chain.blocks VALUES(1,'0x1','0x0',1)");process.send('uncommitted');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, PG_TEST_CHILD_URL: db.url },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  await Promise.race([
    once(child, "message"),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Child transaction did not start")),
        10000,
      );
      timer.unref();
    }),
  ]);
  const ended = once(child, "exit");
  child.kill("SIGKILL");
  await ended;
  assert.equal(
    (await pool.query("SELECT COUNT(*) FROM chain.blocks")).rows[0].count,
    "0",
  );
});
test("losing the scanner connection relinquishes its lease and stops further commits by that worker", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const old = new PgStore(pool),
    next = new PgStore(pool);
  const release = await old.acquireIndexerLease();
  const pid = (await old.lease.client.query("SELECT pg_backend_pid() AS pid"))
    .rows[0].pid;
  await pool.query("SELECT pg_terminate_backend($1)", [pid]);
  for (let n = 0; n < 100 && !old.lease.lost; n++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(old.lease.lost, true);
  const unlock = await next.acquireIndexerLease();
  await assert.rejects(
    old.applyBlock({
      number: 1,
      hash: "0x1",
      parentHash: "0x0",
      timestamp: 1,
      events: [],
    }),
    (e) => e.code === "INDEXER_LEASE_LOST",
  );
  await next.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    events: [],
  });
  assert.equal((await next.head()).number, 1);
  await release();
  await unlock();
});

test("a scanner that lost its lease cannot rewind or overwrite shared progress", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  store.lease = { lost: true };
  await assert.rejects(store.rewind(0), (e) => e.code === "INDEXER_LEASE_LOST");
  await assert.rejects(
    store.put("status", "rpc", { head: 0 }),
    (e) => e.code === "INDEXER_LEASE_LOST",
  );
});
