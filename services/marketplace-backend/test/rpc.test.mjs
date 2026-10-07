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
