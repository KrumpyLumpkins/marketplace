import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMarketplaceClient,
  prepareCheckout,
  prepareOrder,
  prepareAcceptance,
  prepareCancellation,
  validateCart,
  TransactionCoordinator,
  createMemoryStorage,
  pendingStorageKey,
} from "../dist/index.js";
const cfg = {
  chain: "LOCAL",
  chainId: "0x1",
  marketplace: "0x9",
  demo: false,
  paused: false,
  feeBps: 200,
  feeRecipient: "0x4",
  currencies: [{ address: "0x1", symbol: "TEST", decimals: 0 }],
  collections: [],
  status: { safeForCheckout: true, reasons: [] },
};
const context = { marketplace: "0x9", chain: "LOCAL", account: "0x2" };
const item = {
  orderId: "LOCAL:0x9:0x3:1",
  collection: "0xa",
  tokenId: "9007199254740993",
  currency: "0x1",
  price: "100",
};
const quote = {
  canSubmit: true,
  reasons: [],
  total: "100",
  currency: "0x1",
  approvalAmount: "100",
  expiresAt: 4000000000,
  rows: [
    {
      key: item.orderId,
      valid: true,
      sellerProceeds: "93",
      needsNftApproval: true,
    },
  ],
};
const request = async () => quote;
const account = () => ({
  address: "0x2",
  getChainId: async () => "0x1",
  execute: async () => ({ transaction_hash: "0xaa" }),
  waitForTransaction: async () => ({
    finality_status: "ACCEPTED_ON_L2",
    execution_status: "SUCCEEDED",
    block_number: 9,
  }),
  getTransactionReceipt: async () => ({}),
});
const coordinator = () =>
  new TransactionCoordinator({
    request: async () => ({ reflected: true }),
    pollAttempts: 1,
    sleep: async () => {},
  });
test("checkout prepares bounded approval and atomic buy calls", async () => {
  const result = await prepareCheckout(request, context, [item]);
  assert.deepEqual(
    result.calls.map((c) => c.entrypoint),
    ["approve", "buy_many"],
  );
  assert.equal(result.calls[1].calldata[0], "1");
});
test("cart rejects mixed currencies, duplicates and more than 25 NFTs", () => {
  assert.throws(
    () =>
      validateCart([
        item,
        { ...item, orderId: "LOCAL:0x9:0x3:2", tokenId: "2", currency: "0x2" },
      ]),
    /one currency/,
  );
  assert.throws(() => validateCart([item, item]), /Duplicate/);
  assert.throws(() => validateCart(Array(26).fill(item)), /1–25/);
});
test("preflight cannot increase the reviewed price or approval", async () => {
  await assert.rejects(
    prepareCheckout(async () => ({ ...quote, total: "101" }), context, [item]),
    /terms changed/,
  );
  await assert.rejects(
    prepareCheckout(
      async () => ({ ...quote, approvalAmount: "101" }),
      context,
      [item],
    ),
    /Approval exceeds/,
  );
  await assert.rejects(
    prepareCheckout(request, { ...context, marketplace: "0x8" }, [item]),
    /deployment/,
  );
});
test("order preparation handles all order types and owner-bound repricing", () => {
  const intent = {
    collection: "0xa",
    assets: [{ collection: "0xa", tokenId: "0" }],
    currency: { address: "0x1", decimals: 0 },
    price: "100",
    royaltyPercent: "5",
    durationSeconds: 60,
  };
  for (const [kind, entry] of [
    ["listing", "create_listing"],
    ["token_offer", "create_offer"],
    ["collection_offer", "create_collection_offer"],
  ])
    assert.equal(
      prepareOrder(context, { ...intent, kind }).at(-1).entrypoint,
      entry,
    );
  assert.throws(
    () =>
      prepareOrder(context, {
        ...intent,
        kind: "listing",
        replaceIds: ["LOCAL:0x9:0x3:1"],
      }),
    /Only your/,
  );
  assert.deepEqual(
    prepareOrder(context, {
      ...intent,
      kind: "listing",
      replaceIds: ["LOCAL:0x9:0x2:1"],
    }).map((c) => c.entrypoint),
    ["cancel_order", "approve", "create_listing"],
  );
});
test("offer acceptance preserves token ID and seller minimum and rejects expired review", () => {
  const order = {
    id: item.orderId,
    kind: "collection_offer",
    collection: "0xa",
    currency: "0x1",
  };
  const calls = prepareAcceptance(context, order, item.tokenId, quote);
  assert.equal(calls.at(-1).entrypoint, "accept_collection_offer");
  assert.equal(calls.at(-1).calldata[2], item.tokenId);
  assert.throws(
    () =>
      prepareAcceptance(context, order, item.tokenId, {
        ...quote,
        expiresAt: 1,
      }),
    /expired/,
  );
  assert.throws(
    () => prepareCancellation(context, [item.orderId]),
    /Only your/,
  );
});
test("concurrent calls are locked before asynchronous network checks", async () => {
  const tx = coordinator(),
    a = account(),
    storage = createMemoryStorage();
  let signatures = 0;
  a.execute = async () => {
    signatures++;
    return { transaction_hash: "0xaa" };
  };
  const ctx = () => ({
    account: a,
    config: cfg,
    expectedMarketplace: "0x9",
    storage,
  });
  await Promise.all([
    tx.execute(
      ctx,
      () => [
        { contractAddress: "0x9", entrypoint: "cancel_order", calldata: ["1"] },
      ],
      "cancel",
    ),
    tx.execute(ctx, () => []),
  ]);
  assert.equal(signatures, 1);
  assert.equal(tx.getSnapshot().state.stage, "reflected");
});
test("wallet change while preparing blocks the signature", async () => {
  const tx = coordinator();
  let current = account(),
    signed = 0;
  current.execute = async () => {
    signed++;
    return { transaction_hash: "0xaa" };
  };
  const result = await tx.execute(
    () => ({ account: current, config: cfg, expectedMarketplace: "0x9" }),
    async () => {
      current = { ...current, address: "0x3" };
      return [
        { contractAddress: "0x9", entrypoint: "cancel_order", calldata: ["1"] },
      ];
    },
  );
  assert.equal(result, false);
  assert.equal(signed, 0);
});
test("unknown submission response retains intent and blocks retry", async () => {
  const tx = coordinator(),
    a = account(),
    storage = createMemoryStorage();
  let signed = 0;
  a.execute = async () => {
    signed++;
    throw new Error("Network disconnected during submission");
  };
  const ctx = () => ({
    account: a,
    config: cfg,
    expectedMarketplace: "0x9",
    storage,
  });
  const calls = () => [
    { contractAddress: "0x9", entrypoint: "cancel_order", calldata: ["1"] },
  ];
  await tx.execute(ctx, calls);
  await tx.execute(ctx, calls);
  assert.equal(signed, 1);
  assert.equal(
    JSON.parse(storage.getItem(pendingStorageKey(a.address, "LOCAL", "0x9")))
      .unknown,
    true,
  );
  tx.reconcileUnknown(ctx(), { transactionHash: "0xaa" });
  assert.equal(await tx.resume(ctx), true);
  assert.equal(signed, 1);
});
test("rejected signatures can be retried intentionally; stale markets still permit cancellation", async () => {
  const tx = coordinator(),
    a = account(),
    storage = createMemoryStorage();
  a.execute = async () => {
    throw Object.assign(new Error("User rejected"), { code: 4001 });
  };
  const ctx = () => ({
    account: a,
    config: cfg,
    expectedMarketplace: "0x9",
    storage,
  });
  await tx.execute(ctx, () => [
    { contractAddress: "0x9", entrypoint: "cancel_order", calldata: ["1"] },
  ]);
  assert.equal(
    storage.getItem(pendingStorageKey(a.address, "LOCAL", "0x9")),
    null,
  );
  a.execute = async () => ({ transaction_hash: "0xbb" });
  const paused = () => ({
    ...ctx(),
    config: { ...cfg, status: { safeForCheckout: false } },
  });
  assert.equal(await tx.execute(paused, () => []), false);
  assert.equal(
    await tx.execute(
      paused,
      () => [
        { contractAddress: "0x9", entrypoint: "cancel_order", calldata: ["1"] },
      ],
      "cancel",
    ),
    true,
  );
});
test("public SDK prepares and submits a reviewed trade but does not implicitly monitor or re-sign it", async () => {
  let signed = 0;
  const a = account();
  a.execute = async () => {
    signed++;
    return { transaction_hash: "0xaa" };
  };
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    fetch: async (url) =>
      new Response(
        JSON.stringify({
          data: String(url).endsWith("/marketplace/config") ? cfg : quote,
        }),
      ),
  });
  const plan = await client.trades.prepareBuy(a.address, [item]);
  assert.equal(signed, 0);
  assert.throws(() => {
    plan.calls[0].calldata[0] = "0xevil";
  });
  const submitted = await client.trades.submit(plan, a);
  assert.equal(submitted.hash, "0xaa");
  assert.equal(signed, 1);
  assert.equal(client.transactions.getSnapshot().state.stage, "submitted");
  await assert.rejects(client.trades.submit(plan, a), /expired|another/);
  client.dispose();
});
test("storage failure blocks signing rather than losing recovery identity", async () => {
  const tx = coordinator(),
    a = account();
  let signed = 0;
  a.execute = async () => {
    signed++;
    return { transaction_hash: "0xaa" };
  };
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("storage full");
    },
    removeItem: () => {},
  };
  assert.equal(
    await tx.execute(
      () => ({ account: a, config: cfg, expectedMarketplace: "0x9", storage }),
      () => [
        { contractAddress: "0x9", entrypoint: "cancel_order", calldata: ["1"] },
      ],
    ),
    false,
  );
  assert.equal(signed, 0);
});
test("foreign preflight rows and expired cart quotes are rejected", async () => {
  await assert.rejects(
    prepareCheckout(
      async () => ({
        ...quote,
        rows: [{ ...quote.rows[0], key: "LOCAL:0x9:0x3:99" }],
      }),
      context,
      [item],
    ),
    /reviewed orders/,
  );
  await assert.rejects(
    prepareCheckout(async () => ({ ...quote, expiresAt: 1 }), context, [item]),
    /expired/,
  );
});
test("mutating an account during the final config check cannot change the signer", async () => {
  const a = account();
  let reads = 0,
    signed = 0;
  a.execute = async () => {
    signed++;
    return { transaction_hash: "0xaa" };
  };
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    fetch: async (url) => {
      if (String(url).endsWith("/marketplace/config")) {
        reads++;
        if (reads === 2) a.address = "0x7";
        return new Response(JSON.stringify({ data: cfg }));
      }
      return new Response(JSON.stringify({ data: quote }));
    },
  });
  const plan = await client.trades.prepareBuy(a.address, [item]);
  await assert.rejects(client.trades.submit(plan, a), /Wallet changed/);
  assert.equal(signed, 0);
  client.dispose();
});
test("an order must be reviewed again if protocol fee terms change before signing", async () => {
  let reads = 0,
    signed = 0;
  const a = account();
  a.execute = async () => {
    signed++;
    return { transaction_hash: "0xaa" };
  };
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    fetch: async () =>
      new Response(
        JSON.stringify({ data: { ...cfg, feeBps: ++reads === 1 ? 200 : 300 } }),
      ),
  });
  const plan = await client.trades.prepareListing(a.address, {
    collection: "0xa",
    assets: [{ collection: "0xa", tokenId: "1" }],
    currency: { address: "0x1", decimals: 0 },
    price: "100",
    royaltyPercent: "5",
    durationSeconds: 60,
  });
  assert.equal(plan.terms.minimumSellerProceeds, "93");
  await assert.rejects(client.trades.submit(plan, a), /Fee terms changed/);
  assert.equal(signed, 0);
  client.dispose();
});
test("recovery can check a submitted transaction when the configuration endpoint is offline", async () => {
  let offline = false;
  const a = account();
  const client = createMarketplaceClient({
    apiUrl: "https://indexer.example",
    chain: "LOCAL",
    chainId: "0x1",
    expectedMarketplace: "0x9",
    fetch: async (url) => {
      const path = String(url);
      if (path.endsWith("/marketplace/config")) {
        if (offline) throw new Error("config offline");
        return new Response(JSON.stringify({ data: cfg }));
      }
      return new Response(
        JSON.stringify({
          data: path.includes("/transactions/") ? { reflected: true } : quote,
        }),
      );
    },
  });
  const plan = await client.trades.prepareBuy(a.address, [item]);
  await client.trades.submit(plan, a);
  offline = true;
  assert.equal(await client.transactions.watch(a), true);
  client.dispose();
});
