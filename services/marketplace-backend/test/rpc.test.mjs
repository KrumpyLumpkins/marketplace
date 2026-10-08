import { test } from "node:test";
import assert from "node:assert/strict";
import { RpcClient } from "../src/rpc.mjs";
test("RPC retries transport failures on fallback and validates response IDs", async () => {
  let calls = 0;
  const client = new RpcClient(
    ["https://first.invalid", "https://second.invalid"],
    {
      retries: 1,
      fetch: async (url, options) => {
        calls++;
        if (url.includes("first")) throw new Error("offline");
        const body = JSON.parse(options.body);
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x1" }),
        );
      },
    },
  );
  assert.equal(await client.call("starknet_chainId", []), "0x1");
  assert.equal(calls, 2);
});
test("RPC application errors are not silently converted into zero or retried", async () => {
  const client = new RpcClient(["https://rpc.invalid"], {
    fetch: async (_url, options) =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: JSON.parse(options.body).id,
          error: { code: 40, message: "contract error" },
        }),
      ),
  });
  await assert.rejects(client.call("starknet_call", {}), /contract error/);
});
test("contract calldata uses canonical RPC hex felts while preserving bigint precision", async () => {
  const client = new RpcClient(["https://rpc.invalid"], {
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.params.request.calldata, [
        "0x1",
        "0x20000000000001",
        "0x0",
      ]);
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: [] }),
      );
    },
  });
  await client.contract("0x1", "0x2", ["1", "9007199254740993", "0"]);
});

test("RPC batches correlate reordered IDs and reject missing or duplicate replies", async () => {
  let corrupt = false;
  const rpc = new RpcClient(["https://rpc.invalid"], {
    retries: 0,
    fetch: async (_, o) => {
      const requests = JSON.parse(o.body);
      const rows = requests
        .map((r) => ({ jsonrpc: "2.0", id: r.id, result: r.params.n }))
        .reverse();
      if (corrupt) rows[0] = rows[1];
      return new Response(JSON.stringify(rows));
    },
  });
  const requests = [
    { method: "starknet_getBlockWithReceipts", params: { n: 1 } },
    { method: "starknet_getBlockWithReceipts", params: { n: 2 } },
  ];
  assert.deepEqual(await rpc.batch(requests), [1, 2]);
  corrupt = true;
  await assert.rejects(rpc.batch(requests), /identity|duplicate/i);
});
test("oversized RPC batches split into bounded sequential requests without dropping results", async () => {
  const sizes = [];
  const rpc = new RpcClient(["https://rpc.invalid"], {
    maxBytes: 180,
    retries: 0,
    fetch: async (_, o) => {
      const requests = JSON.parse(o.body);
      sizes.push(requests.length);
      return new Response(
        JSON.stringify(
          requests.map((r) => ({
            jsonrpc: "2.0",
            id: r.id,
            result: "x".repeat(80),
          })),
        ),
      );
    },
  });
  const result = await rpc.batch(
    Array.from({ length: 4 }, () => ({
      method: "starknet_getBlockWithReceipts",
      params: {},
    })),
  );
  assert.equal(result.length, 4);
  assert.ok(sizes.includes(1));
});
test("RPC batch rejection can fall back to individual reads, while an item error fails the complete batch", async () => {
  let fail = false;
  const rpc = new RpcClient(["https://rpc.invalid"], {
    fetch: async (_, o) => {
      const b = JSON.parse(o.body);
      return new Response(
        JSON.stringify(
          Array.isArray(b)
            ? fail
              ? b.map((r) => ({
                  jsonrpc: "2.0",
                  id: r.id,
                  error: { code: 24, message: "block missing" },
                }))
              : {
                  jsonrpc: "2.0",
                  id: null,
                  error: { code: -32600, message: "batch unsupported" },
                }
            : { jsonrpc: "2.0", id: b.id, result: "ok" },
        ),
      );
    },
  });
  assert.deepEqual(
    await rpc.batch([{ method: "starknet_chainId", params: [] }]),
    ["ok"],
  );
  fail = true;
  await assert.rejects(
    rpc.batch([{ method: "starknet_chainId", params: [] }]),
    /block missing/,
  );
});

test("batch throttling retries only failed items and honors a shared cooldown", async () => {
  const sent = [],
    waits = [];
  let attempt = 0,
    clock = 0;
  const rpc = new RpcClient(["https://rpc.invalid"], {
    rateLimitRetries: 2,
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    fetch: async (_, o) => {
      const b = JSON.parse(o.body);
      sent.push(b.map((x) => x.params.n));
      attempt++;
      return new Response(
        JSON.stringify(
          b.map((r) =>
            attempt === 1 && r.params.n === 2
              ? {
                  jsonrpc: "2.0",
                  id: r.id,
                  error: { code: 429, message: "rate limited" },
                }
              : { jsonrpc: "2.0", id: r.id, result: r.params.n },
          ),
        ),
      );
    },
  });
  assert.deepEqual(
    await rpc.batch(
      [1, 2, 3].map((n) => ({
        method: "starknet_getBlockWithReceipts",
        params: { n },
      })),
    ),
    [1, 2, 3],
  );
  assert.deepEqual(sent, [[1, 2, 3], [2]]);
  assert.ok(waits.some((ms) => ms >= 500));
});
test("persistent HTTP rate limits fail after a bounded retry budget", async () => {
  let calls = 0,
    clock = 0;
  const rpc = new RpcClient(["https://rpc.invalid"], {
    rateLimitRetries: 2,
    retries: 0,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async () => {
      calls++;
      return new Response("", { status: 429, headers: { "retry-after": "1" } });
    },
  });
  await assert.rejects(
    rpc.batch([{ method: "starknet_chainId", params: [] }]),
    (e) => e.code === "RPC_RATE_LIMITED",
  );
  assert.equal(calls, 3);
});

test("individual receipt reads back off on JSON-RPC throttling without retrying ordinary application errors", async () => {
  let calls = 0,
    clock = 0;
  const waits = [];
  const rpc = new RpcClient(["https://rpc.invalid"], {
    now: () => clock,
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    fetch: async (_, o) => {
      const { id } = JSON.parse(o.body);
      calls++;
      return new Response(
        JSON.stringify(
          calls === 1
            ? {
                jsonrpc: "2.0",
                id,
                error: { code: 429, message: "rate limited" },
              }
            : { jsonrpc: "2.0", id, result: "ok" },
        ),
      );
    },
  });
  assert.equal(await rpc.call("starknet_getBlockWithReceipts", {}), "ok");
  assert.equal(calls, 2);
  assert.equal(rpc.rateLimits, 1);
  assert.ok(waits.some((ms) => ms >= 500));
});
