import assert from "node:assert/strict";
import { createMarketplaceClient, parseOrderKey } from "@biblio/marketplace";
import {
  MarketplaceProvider,
  useMarketplaceQuery,
} from "@biblio/marketplace-react";
import React from "react";
import { renderToString } from "react-dom/server";
import { createApi } from "../../services/marketplace-backend/src/api.mjs";
import { scanOnce } from "../../services/marketplace-backend/src/indexer.mjs";
export async function runSdkDevnetJourney({
  store,
  rpc,
  provider,
  config,
  admin,
  seller,
  buyer,
  nft,
  currency,
  execute,
  call,
}) {
  const server = createApi({ store, rpc, config });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const options = {
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    chain: config.chain,
    chainId: config.chainId,
    expectedMarketplace: config.marketplace,
    contractReader: {
      getChainId: () => provider.getChainId(),
      call: (call, { blockId }) => provider.callContract(call, blockId),
    },
  };
  const client = createMarketplaceClient(options),
    reactClient = createMarketplaceClient(options);
  const adapter = (a) => ({
    address: a.address,
    getChainId: () => provider.getChainId(),
    execute: (calls) => a.execute(calls),
    waitForTransaction: (hash, opts) => provider.waitForTransaction(hash, opts),
    getTransactionReceipt: (hash) => provider.getTransactionReceipt(hash),
  });
  const sync = () => scanOnce(store, rpc, config, { window: 1000 });
  const intent = (tokenId, price = "100") => ({
    collection: nft.address,
    assets: [{ collection: nft.address, tokenId: String(tokenId) }],
    currency: { address: currency.address, decimals: 0 },
    price,
    royaltyPercent: "10",
    durationSeconds: 86400,
  });
  async function submit(plan, account, consumer = client) {
    const wallet = adapter(account),
      record = await consumer.trades.submit(plan, wallet);
    assert.ok(
      record && record.hash,
      consumer.transactions.getSnapshot().state.message,
    );
    await wallet.waitForTransaction(record.hash, {
      retryInterval: 100,
      retries: 60,
    });
    await sync();
    assert.equal(
      await consumer.transactions.resume(() => ({
        account: wallet,
        config: { ...config, status: { safeForCheckout: true }, demo: false },
        expectedMarketplace: config.marketplace,
      })),
      true,
    );
    assert.equal(consumer.transactions.getSnapshot().state.stage, "reflected");
  }
  async function openOrder(kind, tokenId) {
    const page = await client.orders.list(nft.address, {
      kind,
      state: "open",
      limit: 100,
    });
    const order = page.items.find(
      (o) =>
        o.kind === kind && (tokenId == null || o.tokenId === String(tokenId)),
    );
    assert.ok(order);
    return order;
  }
  try {
    await execute(
      admin,
      [300, 301, 302, 303, 304].map((id) =>
        call(nft.address, "mint", [seller.address, id, 0]),
      ),
    );
    await sync();
    await submit(
      await client.trades.prepareListing(seller.address, intent(300)),
      seller,
    );
    const listing = await openOrder("listing", 300);
    await submit(
      await client.trades.prepareBuy(buyer.address, [
        {
          orderId: listing.id,
          collection: nft.address,
          tokenId: "300",
          currency: currency.address,
          price: listing.buyerDebit,
        },
      ]),
      buyer,
    );
    assert.equal(
      BigInt((await client.tokens.get(nft.address, "300")).owner),
      BigInt(buyer.address),
    );
    await submit(
      await reactClient.trades.prepareTokenOffer(
        buyer.address,
        intent(301, "80"),
      ),
      buyer,
      reactClient,
    );
    await submit(
      await client.trades.prepareAcceptOffer(
        seller.address,
        await openOrder("token_offer", 301),
        "301",
      ),
      seller,
    );
    await submit(
      await client.trades.prepareCollectionOffer(
        buyer.address,
        intent(302, "90"),
      ),
      buyer,
    );
    await submit(
      await client.trades.prepareAcceptOffer(
        seller.address,
        await openOrder("collection_offer"),
        "302",
      ),
      seller,
    );
    await submit(
      await client.trades.prepareListing(seller.address, intent(303)),
      seller,
    );
    await submit(
      await client.trades.prepareCancel(seller.address, [
        (await openOrder("listing", 303)).id,
      ]),
      seller,
    );
    await submit(
      await client.trades.prepareListing(seller.address, intent(304)),
      seller,
    );
    await submit(
      await client.trades.prepareReprice(seller.address, {
        ...intent(304, "110"),
        replaceIds: [(await openOrder("listing", 304)).id],
      }),
      seller,
    );
    assert.equal((await openOrder("listing", 304)).buyerDebit, "110");
    // Contract parity: direct reads, single buy, native batch cancel, every governance entrypoint.
    const contractConfig = await client.contract.getConfig();
    assert.equal(contractConfig.version, 1);
    assert.equal(BigInt(contractConfig.admin), BigInt(admin.address));
    const currentListing = await openOrder("listing", 304),
      key = parseOrderKey(currentListing.id, config.chain, config.marketplace);
    assert.equal((await client.contract.getOrder(key)).royaltyAmount, "5");
    assert.equal(
      (await client.contract.quoteTerms(nft.address, "304", "100"))
        .sellerProceeds,
      "93",
    );
    await execute(admin, [
      call(nft.address, "set_royalty", [admin.address, 7, 0]),
    ]);
    assert.equal(
      (await client.contract.quoteTerms(nft.address, "304", "100"))
        .royaltyAmount,
      "7",
    );
    assert.equal(
      (await client.contract.getOrder(key)).royaltyAmount,
      "5",
      "Existing token orders keep royalty snapshots",
    );
    await execute(admin, [
      call(nft.address, "set_royalty", [admin.address, 5, 0]),
    ]);
    await sync();
    const single = await client.trades.prepareBuyListing(buyer.address, {
      orderId: currentListing.id,
      collection: nft.address,
      tokenId: "304",
      currency: currency.address,
      price: currentListing.buyerDebit,
    });
    assert.equal(single.calls.at(-1).entrypoint, "buy_listing");
    await submit(single, buyer);
    assert.equal((await client.contract.getOrder(key)).state, "filled");
    await execute(
      admin,
      [305, 306].map((id) =>
        call(nft.address, "mint", [seller.address, id, 0]),
      ),
    );
    await sync();
    await submit(
      await client.trades.prepareListing(seller.address, {
        ...intent(305),
        assets: [
          { collection: nft.address, tokenId: "305" },
          { collection: nft.address, tokenId: "306" },
        ],
      }),
      seller,
    );
    const cancelIds = [
      (await openOrder("listing", 305)).id,
      (await openOrder("listing", 306)).id,
    ];
    async function govern(plan, actor) {
      const wallet = adapter(actor),
        record = await client.contract.admin.submit(plan, wallet);
      await wallet.waitForTransaction(record.hash, {
        retryInterval: 100,
        retries: 60,
      });
      await sync();
      assert.equal(await client.transactions.watch(wallet), true);
      assert.equal(client.transactions.getSnapshot().state.stage, "reflected");
    }
    await govern(
      await client.contract.admin.prepareSetPaused(admin.address, true),
      admin,
    );
    assert.equal((await client.contract.getConfig()).paused, true);
    const batch = await client.trades.prepareCancel(seller.address, cancelIds);
    assert.equal(batch.calls[0].entrypoint, "cancel_orders");
    await submit(batch, seller);
    assert.equal(
      (
        await client.contract.getOrder(
          parseOrderKey(cancelIds[0], config.chain, config.marketplace),
        )
      ).state,
      "cancelled",
    );
    const again = await client.trades.prepareCancel(seller.address, cancelIds),
      cancelWallet = adapter(seller),
      againTx = await client.trades.submit(again, cancelWallet);
    await cancelWallet.waitForTransaction(againTx.hash, {
      retryInterval: 100,
      retries: 60,
    });
    await sync();
    assert.equal(await client.transactions.watch(cancelWallet), true);
    assert.equal(client.transactions.getSnapshot().state.stage, "accepted");
    assert.match(client.transactions.getSnapshot().state.message, /no new/);
    await govern(
      await client.contract.admin.prepareSetPaused(admin.address, false),
      admin,
    );
    await govern(
      await client.contract.admin.prepareSetCurrency(
        admin.address,
        currency.address,
        false,
      ),
      admin,
    );
    assert.equal(
      store
        .list("policy")
        .find(
          (p) =>
            p.type === "currency_policy" &&
            BigInt(p.address) === BigInt(currency.address),
        ).enabled,
      false,
    );
    await govern(
      await client.contract.admin.prepareSetCurrency(
        admin.address,
        currency.address,
        true,
      ),
      admin,
    );
    await govern(
      await client.contract.admin.prepareSetCollection(
        admin.address,
        nft.address,
        false,
      ),
      admin,
    );
    await assert.rejects(client.contract.quoteTerms(nft.address, "305", "100"));
    await govern(
      await client.contract.admin.prepareSetCollection(
        admin.address,
        nft.address,
        true,
      ),
      admin,
    );
    await govern(
      await client.contract.admin.prepareProposeAdmin(
        admin.address,
        seller.address,
      ),
      admin,
    );
    await govern(
      await client.contract.admin.prepareAcceptAdmin(seller.address),
      seller,
    );
    assert.equal(
      BigInt((await client.contract.getConfig()).admin),
      BigInt(seller.address),
    );
    assert.equal(BigInt(store.get("config", "pending_admin").admin), 0n);
    await assert.rejects(
      client.contract.admin.prepareSetPaused(admin.address, true),
      /administrator/,
    );
    await govern(
      await client.contract.admin.prepareProposeAdmin(
        seller.address,
        admin.address,
      ),
      seller,
    );
    await govern(
      await client.contract.admin.prepareAcceptAdmin(admin.address),
      admin,
    );
    await govern(await client.contract.admin.prepareSetFee(admin.address, 300, seller.address), admin);
    assert.equal((await client.contract.getConfig()).feeBps, 300);
    assert.equal(store.get("config", "marketplace").feeBps, 300);
    assert.equal(BigInt(store.get("config", "marketplace").feeRecipient), BigInt(seller.address));
    await govern(await client.contract.admin.prepareSetFee(admin.address, 200, admin.address), admin);
    const path = `/tokens/${nft.address}/301`;
    await reactClient.request(path);
    function Consumer() {
      const query = useMarketplaceQuery(path);
      return React.createElement("p", null, query.data?.owner ?? "Loading");
    }
    const html = renderToString(
      React.createElement(
        MarketplaceProvider,
        { client: reactClient },
        React.createElement(Consumer),
      ),
    );
    assert.ok(
      html.includes((await client.tokens.get(nft.address, "301")).owner),
    );
    return {
      listingAndBuy: true,
      tokenOffer: true,
      collectionOffer: true,
      cancellation: true,
      reprice: true,
      receiptAndIndexReflection: true,
      reactConsumerRead: true,
      contractEntrypointParity: true,
      nativeBatchCancelWhilePaused: true,
      idempotentCancelWithoutEvents: true,
      directOrderConfigAndRoyaltyReads: true,
      governanceAndAdminTransfer: true,
      feeAdministration: true,
    };
  } finally {
    client.dispose();
    reactClient.dispose();
    await new Promise((resolve) => server.close(resolve));
  }
}
