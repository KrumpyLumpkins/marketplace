import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sdk from "../dist/index.js";
const abi = JSON.parse(
  readFileSync(
    new URL("../../../contracts/marketplace/abi.json", import.meta.url),
  ),
);
test("every marketplace entrypoint has an exported SDK capability", () => {
  const contract = abi.find(
    (e) => e.type === "interface" && e.name.endsWith("::IMarketplace"),
  );
  assert.deepEqual(
    Object.keys(sdk.CONTRACT_CAPABILITIES).sort(),
    contract.items.map((e) => e.name).sort(),
  );
  const client = sdk.createMarketplaceClient({
    apiUrl: "https://api.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
  });
  for (const capability of Object.values(sdk.CONTRACT_CAPABILITIES))
    for (const path of capability) {
      const root = path.startsWith("client.") ? client : sdk;
      const parts = path.split(".").slice(1);
      assert.equal(
        typeof parts.reduce((v, k) => v?.[k], root),
        "function",
        path,
      );
    }
  client.dispose();
});
test("native batch cancellation and single buys match Cairo calldata", () => {
  assert.deepEqual(
    sdk.buildCancelOrders("0x9", ["1", "18446744073709551615"]).calldata,
    ["2", "1", "18446744073709551615"],
  );
  assert.deepEqual(
    sdk.buildBuyListing(
      "0x9",
      { maker: "0x2", nonce: "1" },
      "0x3",
      (1n << 128n).toString(),
    ).calldata,
    ["0x2", "1", "0x3", "0", "1"],
  );
  assert.throws(() => sdk.buildCancelOrders("0x9", []), /1–25/);
  assert.throws(() => sdk.buildCancel("0x9", "18446744073709551616"), /u64/);
  assert.throws(
    () =>
      sdk.buildBuyMany(
        "0x9",
        [{ maker: "0x2", nonce: "1" }],
        "0x3",
        "1",
        Number.MAX_SAFE_INTEGER + 1,
      ),
    /integer/,
  );
});
test("constructor and administrative calls validate addresses, booleans and fee cap", () => {
  assert.deepEqual(sdk.buildConstructorCalldata("0x1", 500, "0x2"), [
    "0x1",
    "500",
    "0x2",
  ]);
  assert.throws(() => sdk.buildConstructorCalldata("0x1", 501, "0x2"), /500/);
  assert.throws(() => sdk.buildSetCollection("0x9", "0x0", true), /address/i);
  assert.throws(() => sdk.buildSetPaused("0x9", "false"), /boolean/);
  assert.equal(sdk.buildAcceptAdmin("0x9").entrypoint, "accept_admin");
});
test("exact royalty caps cover contract-valid orders beyond the UI percentage policy", () => {
  const calls = sdk.prepareOrder(
    { marketplace: "0x9", chain: "LOCAL", account: "0x2" },
    {
      kind: "listing",
      collection: "0xa",
      assets: [{ collection: "0xa", tokenId: "0" }],
      currency: { address: "0x1", decimals: 0 },
      price: "100",
      maxRoyalty: "75",
      durationSeconds: 60,
    },
  );
  assert.deepEqual(calls.at(-1).calldata.slice(-2), ["75", "0"]);
});
test("ABI coverage matches the Cairo interface and the generated source manifest", async () => {
  const { createHash } = await import("node:crypto");
  const source = readFileSync(
    new URL("../../../contracts/marketplace/src/lib.cairo", import.meta.url),
    "utf8",
  );
  const names = [
    ...source
      .split("pub trait IMarketplace<T> {")[1]
      .split("#[starknet::contract]")[0]
      .matchAll(/\bfn\s+(\w+)\s*\(/g),
  ].map((m) => m[1]);
  assert.deepEqual(names.sort(), Object.keys(sdk.CONTRACT_CAPABILITIES).sort());
  assert.equal(
    createHash("sha256").update(JSON.stringify(abi)).digest("hex"),
    sdk.SUPPORTED_MARKETPLACE_ABI_SHA256,
    "Review SDK encoders/decoders and update the supported ABI fingerprint after ABI changes.",
  );
  assert.deepEqual(
    abi.find((e) => e.type === "constructor").inputs.map((i) => i.name),
    ["admin", "fee_bps", "fee_recipient"],
  );
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        "../../../contracts/marketplace/artifact-manifest.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    manifest.sourceSha256,
    "Regenerate the ABI and class manifest after changing Cairo source.",
  );
});
const felts = [
  "1",
  "0xa",
  "17",
  "1",
  "0x3",
  "100",
  "0",
  "18446744073709551615",
  "75",
  "0",
  "0x4",
  "5",
  "0",
  "1",
];
test("direct reads are TanStack queries, preserve u256/u64 values and support pinned blocks", async () => {
  let calls = 0;
  const client = sdk.createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    fetch: async () => {
      throw new Error("HTTP must not be used");
    },
    contractReader: {
      getChainId: async () => "0x1",
      call: async (call, { blockId }) => {
        calls++;
        assert.equal(call.entrypoint, "get_order");
        assert.deepEqual(blockId, { block_number: 123 });
        return felts;
      },
    },
  });
  try {
    const [a, b] = await Promise.all([
      client.contract.getOrder(
        { maker: "0x2", nonce: "1" },
        { blockId: { block_number: 123 } },
      ),
      client.contract.getOrder(
        { maker: "0x2", nonce: "1" },
        { blockId: { block_number: 123 } },
      ),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.tokenId, ((1n << 128n) + 17n).toString());
    assert.equal(a.expiry, "18446744073709551615");
    assert.equal(a.state, "open");
    assert.equal(calls, 1);
  } finally {
    client.dispose();
  }
});
test("read decoders distinguish missing orders and reject malformed or incompatible responses", () => {
  assert.equal(sdk.decodeContractOrder(Array(14).fill("0")).state, "missing");
  assert.deepEqual(sdk.decodeContractConfig(["1", "0x2", "1", "500", "0x4"]), {
    version: 1,
    admin: "0x2",
    paused: true,
    feeBps: 500,
    feeRecipient: "0x4",
  });
  assert.throws(
    () => sdk.decodeContractConfig(["2", "0x2", "0", "200", "0x4"]),
    /version/,
  );
  assert.throws(
    () => sdk.decodeContractConfig(["1", "0x2", "2", "200", "0x4"]),
    /boolean/,
  );
  assert.throws(() => sdk.decodeContractOrder(["1"]), /length/);
  assert.throws(
    () =>
      sdk.decodeContractOrder(
        felts.map((x, i) => (i === 2 ? (1n << 128n).toString() : x)),
      ),
    /limb/,
  );
  assert.equal(
    sdk.decodeContractQuote(["2", "0", "0x4", "5", "0", "93", "0"], "100")
      .sellerProceeds,
    "93",
  );
  assert.throws(
    () =>
      sdk.decodeContractQuote(["2", "0", "0x0", "5", "0", "93", "0"], "100"),
    /accounting/,
  );
});
test("direct reads fail closed on missing adapters and incorrect RPC networks", async () => {
  let called = false;
  const client = sdk.createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    contractReader: {
      getChainId: async () => "0x2",
      call: async () => {
        called = true;
        return [];
      },
    },
  });
  try {
    await assert.rejects(client.contract.getConfig(), /network/);
    assert.equal(called, false);
  } finally {
    client.dispose();
  }
  const absent = sdk.createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
  });
  try {
    await assert.rejects(absent.contract.getConfig(), /ContractReader/);
  } finally {
    absent.dispose();
  }
});
const wallet = () => ({
  address: "0x2",
  getChainId: async () => "0x1",
  execute: async () => ({ transaction_hash: "0xaa" }),
  waitForTransaction: async () => ({
    finality_status: "ACCEPTED_ON_L2",
    execution_status: "SUCCEEDED",
  }),
  getTransactionReceipt: async () => ({}),
});
function governance() {
  let admin = "0x2";
  const client = sdk.createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    fetch: async () => {
      throw new Error("Indexer offline");
    },
    contractReader: {
      getChainId: async () => "0x1",
      call: async () => ["1", admin, "1", "200", "0x4"],
    },
  });
  return {
    client,
    setAdmin: (value) => {
      admin = value;
    },
  };
}
test("governance uses explicit immutable plans and works while paused with an offline indexer", async () => {
  const { client } = governance();
  try {
    const plan = await client.contract.admin.prepareSetPaused("0x2", false);
    assert.throws(() => {
      plan.calls[0].calldata[0] = "1";
    });
    const tx = await client.contract.admin.submit(plan, wallet());
    assert.equal(tx.hash, "0xaa");
    await assert.rejects(
      client.contract.admin.submit(plan, wallet()),
      /review|another/,
    );
  } finally {
    client.dispose();
  }
});
test("governance rejects non-admin preparation, changed administrators and foreign plans", async () => {
  const { client, setAdmin } = governance(),
    other = governance();
  try {
    await assert.rejects(
      client.contract.admin.prepareSetCurrency("0x3", "0x4", true),
      /administrator/,
    );
    const plan = await client.contract.admin.prepareProposeAdmin("0x2", "0x3");
    await assert.rejects(
      other.client.contract.admin.submit(plan, wallet()),
      /another/,
    );
    setAdmin("0x4");
    await assert.rejects(
      client.contract.admin.submit(plan, wallet()),
      /Administrator changed/,
    );
    // v1 has no pending-admin getter: preparation is possible, but Cairo checks nomination on submission.
    assert.equal(
      (await client.contract.admin.prepareAcceptAdmin("0x3")).action,
      "accept_admin",
    );
  } finally {
    client.dispose();
    other.client.dispose();
  }
});
test("high-level cancellation uses the native span entrypoint and creation supports full u64 expiries", () => {
  assert.equal(
    sdk.prepareCancellation(
      { marketplace: "0x9", chain: "LOCAL", account: "0x2" },
      ["LOCAL:0x9:0x2:1", "LOCAL:0x9:0x2:2"],
    )[0].entrypoint,
    "cancel_orders",
  );
  const intent = {
    kind: "listing",
    collection: "0xa",
    assets: [{ collection: "0xa", tokenId: "0" }],
    currency: { address: "0x3", decimals: 0 },
    price: "100",
    maxRoyalty: (2n ** 256n - 1n).toString(),
    expiry: "18446744073709551615",
  };
  assert.equal(
    sdk
      .prepareOrder(
        { marketplace: "0x9", chain: "LOCAL", account: "0x2" },
        intent,
      )
      .at(-1).calldata[6],
    "18446744073709551615",
  );
  assert.throws(
    () =>
      sdk.estimateSellerProceeds({
        ...intent,
        decimals: 0,
        feeBps: 200,
        count: 1,
        kind: "collection_offer",
      }),
    /proceeds/,
  );
  assert.equal(
    sdk.estimateSellerProceeds({
      ...intent,
      decimals: 0,
      feeBps: 200,
      count: 1,
    }),
    "1",
  );
  assert.throws(
    () =>
      sdk.estimateSellerProceeds({
        price: "100",
        decimals: 0,
        feeBps: 501,
        royaltyPercent: "0",
        count: 1,
      }),
    /fee/,
  );
});
test("cancellation can be prepared and submitted from on-chain config without the indexer", async () => {
  const { client } = governance();
  try {
    const plan = await client.trades.prepareCancel("0x2", ["LOCAL:0x9:0x2:1"]);
    assert.equal(plan.mode, "cancel");
    assert.equal((await client.trades.submit(plan, wallet())).hash, "0xaa");
  } finally {
    client.dispose();
  }
});
test("idempotent cancellation without market events does not wait for an impossible index event", async () => {
  let queries = 0;
  const tx = new sdk.TransactionCoordinator({
      request: async () => {
        queries++;
        return { reflected: false };
      },
      pollAttempts: 1,
      sleep: async () => {},
    }),
    storage = sdk.createMemoryStorage(),
    a = wallet();
  a.waitForTransaction = async () => ({
    finality_status: "ACCEPTED_ON_L2",
    execution_status: "SUCCEEDED",
    events: [{ from_address: "0x3" }],
  });
  const context = () => ({
    account: a,
    expectedMarketplace: "0x9",
    config: {
      chain: "LOCAL",
      chainId: "0x1",
      marketplace: "0x9",
      demo: false,
      status: { safeForCheckout: false },
    },
    storage,
  });
  assert.equal(
    await tx.execute(context, () => [sdk.buildCancel("0x9", "1")], "cancel"),
    true,
  );
  assert.equal(queries, 0);
  assert.equal(tx.getSnapshot().state.stage, "accepted");
  assert.match(tx.getSnapshot().state.message, /no new/i);
  assert.equal(
    storage.getItem(sdk.pendingStorageKey("0x2", "LOCAL", "0x9")),
    null,
  );
});
test("confirmed cancellation and governance remain usable during index lag, while trades keep their recovery lock", async () => {
  for (const mode of ["cancel", "admin", "trade"]) {
    const tx = new sdk.TransactionCoordinator({
        request: async () => ({ reflected: false }),
        pollAttempts: 1,
        sleep: async () => {},
      }),
      storage = sdk.createMemoryStorage(),
      a = wallet();
    a.waitForTransaction = async () => ({
      finality_status: "ACCEPTED_ON_L2",
      execution_status: "SUCCEEDED",
      events: [{ from_address: "0x9" }],
    });
    const c = () => ({
      account: a,
      expectedMarketplace: "0x9",
      config: {
        chain: "LOCAL",
        chainId: "0x1",
        marketplace: "0x9",
        demo: false,
        status: { safeForCheckout: true },
      },
      storage,
    });
    assert.equal(
      await tx.execute(
        c,
        () => [
          mode === "admin"
            ? sdk.buildSetPaused("0x9", true)
            : sdk.buildCancel("0x9", "1"),
        ],
        mode,
      ),
      true,
    );
    assert.equal(tx.getSnapshot().state.stage, "accepted");
    assert.equal(
      storage.getItem(sdk.pendingStorageKey("0x2", "LOCAL", "0x9")) === null,
      mode !== "trade",
    );
  }
});
test("direct query options snapshot order keys and block IDs before callers mutate form state", async () => {
  const client = sdk.createMarketplaceClient({
    apiUrl: "https://offline.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    contractReader: {
      getChainId: async () => "0x1",
      call: async (call, options) => {
        assert.deepEqual(call.calldata, ["0x2", "1"]);
        assert.deepEqual(options.blockId, { block_number: 123 });
        return felts;
      },
    },
  });
  try {
    const key = { maker: "0x2", nonce: "1" },
      blockId = { block_number: 123 };
    const query = client.contract.orderQuery(key, { blockId });
    key.nonce = "2";
    blockId.block_number = 456;
    await client.queryClient.fetchQuery(query);
  } finally {
    client.dispose();
  }
});
