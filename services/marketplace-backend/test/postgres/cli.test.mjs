import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { address } from "../../src/domain.mjs";
function run(db, command) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["services/marketplace-backend/src/indexer-cli.mjs", command, "0"],
      {
        env: {
          ...process.env,
          MARKETPLACE_STORE: "postgres",
          DATABASE_URL: db.url,
          MARKETPLACE_CHAIN: "LOCAL",
          MARKETPLACE_REGISTRY_JSON: JSON.stringify({
            chains: {
              LOCAL: {
                chainId: "0x1",
                marketplace: null,
                collections: [],
                currencies: [],
              },
            },
          }),
        },
      },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (v) => (stdout += v));
    child.stderr.on("data", (v) => (stderr += v));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
test("PostgreSQL reconciliation CLI awaits projections and maintenance rewind respects the running scanner lease", async (t) => {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.bindIdentity({ chainId: "0x1", marketplace: null });
  await store.put("token", "token", {
    id: "token",
    collection: address("9"),
    tokenId: "1",
    owner: address("2"),
  });
  const result = await run(db, "reconcile");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).tokens, 1);
  const release = await store.acquireIndexerLease();
  try {
    const denied = await run(db, "rewind");
    assert.notEqual(denied.code, 0);
    assert.match(denied.stderr, /lease/);
  } finally {
    await release();
  }
});
