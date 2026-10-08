import { test } from "node:test";
import assert from "node:assert/strict";
import { readHistoryContracts } from "../src/history-reads.mjs";
test("historical proof batching preserves every value and pins every call to the checkpoint", async () => {
  const batches = [];
  const block = { block_hash: "0xabc" };
  const calls = Array.from({ length: 70 }, (_, i) => [
    "0x1",
    "0x2",
    [String(i)],
  ]);
  const result = await readHistoryContracts(
    {
      batch: async (batch) => {
        batches.push(batch.length);
        for (const c of batch) {
          assert.equal(c.method, "starknet_call");
          assert.equal(c.params.block_id, block);
        }
        return batch.map((c) => [c.params.request.calldata[0]]);
      },
    },
    calls,
    block,
  );
  assert.deepEqual(batches, [32, 32, 6]);
  assert.deepEqual(
    result,
    calls.map((c) => ["0x" + BigInt(c[2][0]).toString(16)]),
  );
  await assert.rejects(
    readHistoryContracts(
      {
        batch: async () => {
          throw Error("Invalid batch identity");
        },
      },
      calls,
      block,
    ),
    /Invalid batch identity/,
  );
});
