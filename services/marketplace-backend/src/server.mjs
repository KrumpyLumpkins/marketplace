import cluster from "node:cluster";
import { runtime } from "./runtime.mjs";
import { createApi } from "./api.mjs";
import { scanOnce } from "./indexer.mjs";
import { refreshMetadata } from "./metadata.mjs";
const workers = Number(process.env.MARKETPLACE_API_WORKERS ?? 1);
if (!Number.isInteger(workers) || workers < 1 || workers > 8)
  throw new Error("MARKETPLACE_API_WORKERS must be 1–8.");
if (workers > 1 && process.env.MARKETPLACE_INDEXER_ENABLED === "true")
  throw new Error("Use a separate single index worker with clustered APIs.");
if (workers > 1 && cluster.isPrimary) {
  let stopping = false;
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on("exit", () => {
    if (!stopping) setTimeout(() => cluster.fork(), 1000);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopping = true;
      for (const worker of Object.values(cluster.workers)) worker?.kill(signal);
    });
} else {
  const { store, config, rpc } = runtime();
  const api = createApi({ store, config, rpc });
  let stopped = false;
  api.listen(
    Number(process.env.MARKETPLACE_PORT ?? 3100),
    process.env.MARKETPLACE_HOST ?? "127.0.0.1",
    () =>
      console.log(
        JSON.stringify({
          event: "api_ready",
          chain: config.chain,
          port: api.address().port,
          marketplace: config.marketplace ?? null,
        }),
      ),
  );
  async function background() {
    while (!stopped) {
      try {
        await scanOnce(store, rpc, config, { window: 20 });
        if (process.env.MARKETPLACE_METADATA !== "off")
          await refreshMetadata(store, rpc, config, {
            assetDir: config.assetDir,
            limit: 3,
          });
      } catch (e) {
        store.put("status", "rpc", {
          ...store.get("status", "rpc"),
          error: e.code ?? e.message,
          identityVerified: false,
        });
        console.error(
          JSON.stringify({
            event: "indexer_error",
            code: e.code,
            message: e.message,
          }),
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (rpc && process.env.MARKETPLACE_INDEXER_ENABLED === "true") background();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopped = true;
      api.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    });
}
