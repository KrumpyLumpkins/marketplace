import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarketplaceClient, QueryClient } from "../dist/index.js";
const response = (data) =>
  new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
  });
test("TanStack deduplicates reads and isolates clients sharing a query cache", async () => {
  let calls = 0;
  const cache = new QueryClient();
  const make = (chain) =>
    createMarketplaceClient({
      apiUrl: "https://indexer.example",
      chain,
      chainId: "0x1",
      queryClient: cache,
      fetch: async () => {
        calls++;
        return response({ chain });
      },
    });
  const a = make("A"),
    b = make("B");
  const [first, second] = await Promise.all([
    a.request("/marketplace/config"),
    a.request("/marketplace/config"),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  assert.equal((await b.request("/marketplace/config")).chain, "B");
  a.dispose();
  b.dispose();
  cache.clear();
});
test("structured HTTP failures are not converted into empty data or retried", async () => {
  let calls = 0;
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    fetch: async () => {
      calls++;
      return new Response(
        JSON.stringify({ error: { code: "NO_TOKEN", message: "Not indexed" } }),
        { status: 404 },
      );
    },
  });
  await assert.rejects(
    client.tokens.get("0xa", "9007199254740993"),
    (e) => e.code === "NO_TOKEN" && e.status === 404,
  );
  assert.equal(calls, 1);
  client.dispose();
});
test("currency metadata is instance scoped and lossless", () => {
  const a = createMarketplaceClient({
      apiUrl: "https://a.example",
      chain: "LOCAL",
      chainId: "0x1",
    }),
    b = createMarketplaceClient({
      apiUrl: "https://b.example",
      chain: "LOCAL",
      chainId: "0x1",
    });
  a.currencies.configure([{ address: "0x1", symbol: "A", decimals: 6 }]);
  b.currencies.configure([{ address: "0x1", symbol: "B", decimals: 18 }]);
  assert.equal(a.currencies.format("1200000", "0x1"), "1.2");
  assert.equal(b.currencies.format("1200000", "0x1"), "0.0000000000012");
  a.dispose();
  b.dispose();
});
test("TanStack cancellation aborts the underlying request", async () => {
  let aborted = false;
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    fetch: async (_, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () => {
          aborted = true;
          reject(init.signal.reason);
        }),
      ),
  });
  const pending = client.request("/collections");
  const rejection = assert.rejects(pending);
  await client.queryClient.cancelQueries({
    queryKey: client.queryKey("/collections"),
  });
  await rejection;
  assert.equal(aborted, true);
  client.dispose();
});
test("mutations are explicit and never automatically retried", async () => {
  let calls = 0;
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    fetch: async () => {
      calls++;
      throw new Error("offline");
    },
  });
  await assert.rejects(
    client.request("/reports", {}, { collection: "0xa", reason: "test" }),
    /offline/,
  );
  assert.equal(calls, 1);
  client.dispose();
});
test("incompatible API schema and network responses fail closed", async () => {
  for (const meta of [
    { schemaVersion: "2.0.0" },
    { schemaVersion: "1.0.0", chain: "WRONG" },
  ]) {
    const client = createMarketplaceClient({
      apiUrl: "https://indexer.example",
      chain: "LOCAL",
      chainId: "0x1",
      fetch: async () => new Response(JSON.stringify({ data: [], meta })),
    });
    await assert.rejects(client.collections.list(), (e) =>
      ["INCOMPATIBLE_API", "NETWORK_MISMATCH"].includes(e.code),
    );
    client.dispose();
  }
});
test("cached asset URLs follow the configured endpoint rather than the original Next.js proxy", async () => {
  const image = "/api/marketplace/v1/chains/LOCAL/assets/token.png";
  const client = createMarketplaceClient({
    apiUrl: "https://api.example/market",
    chain: "LOCAL",
    chainId: "0x1",
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: {
            image,
            metadata: { image: "https://cdn.example/original.png" },
          },
        }),
      ),
  });
  const token = await client.tokens.get("0xa", "1");
  assert.equal(
    token.image,
    "https://api.example/market/v1/chains/LOCAL/assets/token.png",
  );
  assert.equal(token.metadata.image, "https://cdn.example/original.png");
  client.dispose();
});
