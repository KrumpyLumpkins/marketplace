import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { scanOnce } from "../src/indexer.mjs";
const config = {
  chain: "LOCAL",
  chainId: "0x1",
  marketplace: null,
  collections: [{ address: "0x9", startBlock: 1 }],
};
const block = (n) => ({
  block_number: n,
  block_hash: "0x" + n.toString(16),
  parent_hash: "0x" + (n - 1).toString(16),
  timestamp: n,
  status: "ACCEPTED_ON_L2",
  transactions: [],
});
test("scanner batches every receipt block within bounded concurrency and commits only after coverage/anchor checks", async () => {
  const store = new Store(":memory:");
  let running = 0,
    peak = 0,
    batches = 0;
  const seen = [];
  const rpc = {
    call: async (method, params) =>
      method === "starknet_chainId"
        ? "0x1"
        : method === "starknet_getEvents"
          ? { events: [] }
          : block(
              params.block_id === "latest" ? 40 : params.block_id.block_number,
            ),
    batch: async (calls) => {
      batches++;
      running++;
      peak = Math.max(peak, running);
      assert.ok(calls.length <= 8);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      return calls.map((c) => {
        const n = c.params.block_id.block_number;
        seen.push(n);
        return block(n);
      });
    },
  };
  try {
    const result = await scanOnce(store, rpc, config, {
      window: 40,
      receiptBatchSize: 8,
      receiptConcurrency: 2,
    });
    assert.equal(result.indexed, 40);
    assert.equal(batches, 5);
    assert.equal(peak, 2);
    assert.deepEqual(
      seen.sort((a, b) => a - b),
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    assert.equal(store.head().number, 40);
  } finally {
    store.close();
  }
});
