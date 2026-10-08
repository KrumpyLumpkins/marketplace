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

test("a failed fanout drains in-flight work and stops scheduling before returning", async () => {
  let finished = false,
    calls = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const work = mapConcurrent([0, 1, 2, 3], 2, async (n) => {
    calls++;
    if (n === 0) {
      await gate;
      finished = true;
      return n;
    }
    throw new Error("failed");
  });
  const rejected = assert.rejects(work, /failed/);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 2);
  release();
  await rejected;
  assert.equal(finished, true);
  assert.equal(calls, 2);
});

test('falsy rejection reasons still stop and reject concurrent work',async()=>{
 let calls=0;await assert.rejects(mapConcurrent([1,2,3],1,async()=>{calls++;throw null;}),error=>error===null);assert.equal(calls,1);
});
