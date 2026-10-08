import { createServer } from "node:http";
import { runtime } from "./runtime.mjs";
import { indexerOptions } from "./indexer-options.mjs";
import { scanOnce } from "./indexer.mjs";
import { refreshMetadata } from "./metadata.mjs";
const mode = process.argv[2];
if (!["index", "metadata"].includes(mode))
  throw new Error("Choose index or metadata");
const { store, config, rpc } = await runtime();
const scanOptions = mode === "index" ? indexerOptions() : null;
const enabled = process.env.MARKETPLACE_BACKGROUND_ENABLED !== "false";
if (enabled && (!rpc || !config.collections.length))
  throw new Error(
    "Enabled workers require an RPC and reviewed collection registry",
  );
let stopped = false,
  lastProgress = null,
  lastError = null,
  caughtUp = false,
  releaseLease;
let writerLease =
  mode === "index" ? (enabled ? "waiting" : "disabled") : "not_required";
// SQLite compatibility workers share the API container and must not bind its port.
const healthPort =
  store.dialect === "postgres"
    ? process.env.PORT
    : process.env.MARKETPLACE_WORKER_PORT;
const health = healthPort
  ? createServer((req, res) => {
      if (req.url !== "/health/live") {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          live: !stopped,
          mode,
          enabled,
          lastProgress,
          lastError,
          writerLease: store.lease?.lost ? "lost" : writerLease,
        }),
      );
    })
  : null;
if (health)
  health.listen(Number(healthPort), process.env.MARKETPLACE_HOST ?? "::");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
    health?.close();
  });
try {
  if (enabled && mode === "index" && store.acquireIndexerLease) {
    // Railway probes the replacement before stopping the old container. Serve
    // liveness while waiting; never scan until the database grants the lease.
    while (!stopped && !releaseLease) {
      try {
        releaseLease = await store.acquireIndexerLease();
        writerLease = "held";
      } catch (error) {
        if (error.code !== "INDEXER_LEASE_HELD") throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  while (!stopped) {
    if (enabled) {
      try {
        const result =
          mode === "index"
            ? await scanOnce(store, rpc, config, scanOptions)
            : await refreshMetadata(store, rpc, config, {
                assetDir: config.assetDir,
                limit: 10,
              });
        if (mode === "index") caughtUp = result.indexed >= result.head;
        lastProgress = Date.now();
        lastError = null;
        console.log(
          JSON.stringify({
            event: `${mode}_progress`,
            at: new Date().toISOString(),
            result,
          }),
        );
      } catch (error) {
        lastError = error.code ?? "WORKER_ERROR";
        console.error(
          JSON.stringify({
            event: `${mode}_error`,
            code: lastError,
            message: error.message,
          }),
        );
        if (store.lease?.lost || error.code === "INDEXER_LEASE_LOST")
          throw error;
      }
    }
    if (!stopped)
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          mode === "index" ? (lastError || caughtUp ? 1000 : 100) : 2000,
        ),
      );
  }
} finally {
  health?.close();
  if (releaseLease) await releaseLease();
  await store.close();
}
