import { createServer } from "node:http";
import { runtime } from "./runtime.mjs";
import { scanOnce } from "./indexer.mjs";
import { refreshMetadata } from "./metadata.mjs";
const mode = process.argv[2];
if (!["index", "metadata"].includes(mode))
  throw new Error("Choose index or metadata");
const { store, config, rpc } = await runtime();
const enabled = process.env.MARKETPLACE_BACKGROUND_ENABLED !== "false";
if (enabled && (!rpc || !config.collections.length))
  throw new Error(
    "Enabled workers require an RPC and reviewed collection registry",
  );
let stopped = false,
  lastProgress = null,
  lastError = null,
  releaseLease;
// SQLite compatibility workers share the API container and must not bind its port.
const healthPort = store.dialect === "postgres" ? process.env.PORT : process.env.MARKETPLACE_WORKER_PORT;
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
  if (enabled && mode === "index" && store.acquireIndexerLease)
    releaseLease = await store.acquireIndexerLease();
  while (!stopped) {
    if (enabled) {
      try {
        const result =
          mode === "index"
            ? await scanOnce(store, rpc, config, { window: 100 })
            : await refreshMetadata(store, rpc, config, {
                assetDir: config.assetDir,
                limit: 10,
              });
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
        setTimeout(resolve, mode === "index" ? 1000 : 2000),
      );
  }
} finally {
  health?.close();
  if (releaseLease) await releaseLease();
  await store.close();
}
