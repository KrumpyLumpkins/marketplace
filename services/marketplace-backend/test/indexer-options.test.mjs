import { test } from "node:test";
import assert from "node:assert/strict";
import { indexerOptions } from "../src/indexer-options.mjs";
test("index throughput controls are bounded and environment overrides are explicit", () => {
  assert.deepEqual(indexerOptions({}), {
    fastHistory: false,
    historyWindow: 100000,
    window: 1000,
    receiptConcurrency: 8,
    receiptBatchSize: 1,
    commitBatchSize: 250,
  });
  assert.equal(
    indexerOptions({ MARKETPLACE_INDEX_CONCURRENCY: "8" }).receiptConcurrency,
    8,
  );
  for (const value of ["0", "10000", "1.5", "NaN"])
    assert.throws(() =>
      indexerOptions({ MARKETPLACE_INDEX_CONCURRENCY: value }),
    );
});
