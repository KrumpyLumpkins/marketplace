import { test } from "node:test";
import assert from "node:assert/strict";
import { mapConcurrent } from "../src/concurrency.mjs";
test("RPC fanout stays bounded and results retain input order", async () => {
  let running = 0,
    peak = 0;
  const results = await mapConcurrent(
    Array.from({ length: 25 }, (_, i) => i),
    8,
    async (i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, i % 3));
      running--;
      return i * 2;
    },
  );
  assert.equal(peak, 8);
  assert.deepEqual(
    results,
    Array.from({ length: 25 }, (_, i) => i * 2),
  );
});
