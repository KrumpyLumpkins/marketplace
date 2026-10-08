import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
test("a replacement scanner stays live while waiting for the old writer and indexes only after handoff", async (t) => {
  let child, rpc, release;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await release?.();
    if (rpc) {
      rpc.closeAllConnections();
      await new Promise((r) => rpc.close(r));
    }
  });
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const old = new PgStore(pool);
  await old.bindIdentity({ chainId: "0x1", marketplace: null });
  release = await old.acquireIndexerLease();
  let calls = 0;
  rpc = createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    const q = JSON.parse(body);
    calls++;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: q.id,
        result:
          q.method === "starknet_chainId"
            ? "0x1"
            : {
                block_number: 0,
                block_hash: "0x0",
                parent_hash: "0x0",
                timestamp: 0,
                status: "ACCEPTED_ON_L2",
                transactions: [],
              },
      }),
    );
  });
  await new Promise((r) => rpc.listen(0, "127.0.0.1", r));
  const reservation = createServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  child = spawn(
    process.execPath,
    ["services/marketplace-backend/src/worker.mjs", "index"],
    {
      env: {
        ...process.env,
        DATABASE_URL: db.url,
        MARKETPLACE_STORE: "postgres",
        MARKETPLACE_CHAIN: "LOCAL",
        MARKETPLACE_REGISTRY_JSON: JSON.stringify({
          chains: {
            LOCAL: {
              chainId: "0x1",
              marketplace: null,
              collections: [{ address: "0x9", startBlock: 1 }],
              currencies: [],
            },
          },
        }),
        MARKETPLACE_BACKGROUND_ENABLED: "true",
        MARKETPLACE_RPC_URL: `http://127.0.0.1:${rpc.address().port}`,
        MARKETPLACE_HOST: "127.0.0.1",
        PORT: String(port),
      },
    },
  );
  let stderr = "";
  child.stderr.on("data", (v) => (stderr += v));
  child.stdout.resume();
  const status = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(stderr);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health/live`, {
            signal: AbortSignal.timeout(200),
          }),
          body = await r.json();
        if (predicate(body)) return body;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Worker handoff timed out");
  };
  const waiting = await status((x) => x.writerLease === "waiting");
  assert.equal(waiting.live, true);
  assert.equal(calls, 0);
  await release();
  const active = await status(
    (x) => x.writerLease === "held" && x.lastProgress !== null,
  );
  assert.equal(active.lastError, null);
  assert.ok(calls > 0);
});
