import { runtime } from "./runtime.mjs";
import { scanOnce } from "./indexer.mjs";
import { createHash } from "node:crypto";
const { store, config, rpc } = runtime();
try {
  const command = process.argv[2] ?? "once";
  if (command === "reconcile") {
    const state = {
      head: store.head(),
      tokens: store.list("token"),
      orders: store.list("order"),
      config: store.get("config", "marketplace"),
    };
    console.log(
      JSON.stringify({
        chain: config.chain,
        head: state.head,
        tokens: state.tokens.length,
        orders: state.orders.length,
        hash: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
      }),
    );
  } else if (command === "rewind") {
    const height = Number(process.argv[3]);
    if (!Number.isSafeInteger(height) || height < 0)
      throw new Error("Specify a nonnegative rewind block.");
    store.rewind(height);
    console.log(JSON.stringify({ rewoundTo: store.head() }));
  } else {
    if (!rpc) throw new Error("MARKETPLACE_RPC_URL is required.");
    const stop = process.env.MARKETPLACE_STOP_BLOCK
      ? Number(process.env.MARKETPLACE_STOP_BLOCK)
      : undefined;
    do {
      const result = await scanOnce(store, rpc, config, {
        window: 100,
        stopAt: stop,
      });
      console.log(JSON.stringify(result));
      if (
        command !== "backfill" ||
        result.indexed >= Math.min(result.head, stop ?? Infinity)
      )
        break;
    } while (true);
  }
} finally {
  store.close();
}
