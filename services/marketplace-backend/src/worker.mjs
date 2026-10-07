import { runtime } from "./runtime.mjs";
import { scanOnce } from "./indexer.mjs";
import { refreshMetadata } from "./metadata.mjs";
const { store, config, rpc } = runtime();
if (!rpc) throw new Error("MARKETPLACE_RPC_URL is required.");
const mode = process.argv[2];
if (!["index", "metadata"].includes(mode))
  throw new Error("Choose index or metadata.");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
try {
  while (!stopped) {
    try {
      const result =
        mode === "index"
          ? await scanOnce(store, rpc, config, { window: 100 })
          : await refreshMetadata(store, rpc, config, {
              assetDir: config.assetDir,
              limit: 10,
            });
      console.log(
        JSON.stringify({
          event: `${mode}_progress`,
          at: new Date().toISOString(),
          result,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: `${mode}_error`,
          code: error.code ?? "WORKER_ERROR",
          message: error.message,
        }),
      );
    }
    if (!stopped)
      await new Promise((resolve) =>
        setTimeout(resolve, mode === "index" ? 1000 : 2000),
      );
  }
} finally {
  store.close();
}
