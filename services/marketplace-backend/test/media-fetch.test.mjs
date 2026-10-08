import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaFetcher } from "../src/media-fetch.mjs";
test("image gateway requests are spaced and a 429 delays queued requests before bounded retry", async () => {
  let time = 0,
    first = true;
  const starts = [];
  const fetch = createMediaFetcher(
    async () => {
      starts.push(time);
      if (first) {
        first = false;
        throw Object.assign(new Error("Metadata HTTP 429"), {
          status: 429,
          retryAfterMs: 5000,
        });
      }
      return "image";
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    },
  );
  assert.equal(await fetch("https://example.org/1"), "image");
  assert.equal(await fetch("https://example.org/2"), "image");
  assert.ok(starts[1] - starts[0] >= 5000);
  assert.ok(starts[2] - starts[1] >= 1100);
});
test("image retries are bounded and non-rate-limit failures retain their error", async () => {
  let calls = 0,
    time = 0;
  const fetch = createMediaFetcher(
    async () => {
      calls++;
      throw Object.assign(new Error("Metadata HTTP 429"), { status: 429 });
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    },
  );
  await assert.rejects(fetch("https://example.org/1"), /429/);
  assert.equal(calls, 3);
  const fail = createMediaFetcher(async () => {
    throw new Error("Metadata HTTP 404");
  });
  await assert.rejects(fail("https://example.org/1"), /404/);
});
