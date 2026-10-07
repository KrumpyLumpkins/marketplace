import { runtime } from "./runtime.mjs";
import { createApi } from "./api.mjs";
import { address, orderKey } from "./domain.mjs";
const { store, config } = runtime({
  ...process.env,
  MARKETPLACE_DB:
    process.env.MARKETPLACE_DB ??
    "services/marketplace-backend/data/demo.sqlite",
});
config.demo = true;
config.marketplace = address("0x900");
config.marketplaceStartBlock = 1;
if (!store.head()) {
  const time = Math.floor(Date.now() / 1000),
    currency = address(config.currencies[0].address),
    events = [
      {
        type: "initialized",
        version: 1,
        admin: address("10"),
        feeBps: 200,
        feeRecipient: address("40"),
        paused: false,
      },
    ];
  let nonce = 0;
  const banners = {
    Realms: "realms.png",
    Beasts: "beasts.jpg",
    Adventurers: "adventurers.png",
    "Golden Token": "golden-token.png",
    "Loot Chests": "loot-chests.png",
  };
  for (const c of config.collections) {
    const collection = address(c.address);
    store.put("collection", collection, {
      ...c,
      address: collection,
      verified: true,
      image: `/banners/${banners[c.name] ?? "realms.png"}`,
    });
    events.push({
      type: "collection_policy",
      address: collection,
      enabled: true,
      royalties: true,
    });
    for (let i = 1; i <= 12; i++) {
      events.push({
        type: "transfer",
        collection,
        tokenId: String(i),
        from: address("0"),
        to: address(i % 3 === 0 ? "2" : "1"),
      });
      if (i % 3 !== 0) {
        nonce++;
        events.push({
          type: "order_created",
          key: orderKey(config.chain, config.marketplace, "1", nonce),
          maker: address("1"),
          nonce: String(nonce),
          kind: "listing",
          collection,
          tokenId: String(i),
          currency,
          buyerDebit: String(BigInt(10 + i) * 10n ** 18n),
          expiry: String(time + 30 * 86400),
          royaltyCap: "0",
          royaltyAmount: "0",
          royaltyRecipient: address("0"),
        });
      }
    }
  }
  events.push({ type: "currency_policy", address: currency, enabled: true });
  store.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: time,
    events,
    sources: [
      ...config.collections.map((c) => address(c.address)),
      config.marketplace,
    ],
  });
  for (const token of store.list("token")) {
    const c = config.collections.find(
        (c) => address(c.address) === token.collection,
      ),
      i = Number(token.tokenId);
    const attributes = [
      { name: "Level", value: i * 3 },
      { name: "Power", value: i * 17 },
      { name: "Health", value: 100 + i },
      { name: "Tier", value: (i % 4) + 1 },
      { name: "Shiny", value: i % 2 === 0 },
      { name: "Resource", value: i % 2 ? "Gold" : "Wood" },
    ];
    const image = `/banners/${banners[c.name] ?? "realms.png"}`;
    store.put("token", token.id, {
      ...token,
      attributes,
      image,
      resourceCount: (i % 4) + 1,
      metadataStatus: "ready",
      metadata: {
        name: `${c.name} #${i}`,
        description:
          "Illustrative local fixture. Trading is disabled in demo mode.",
        image,
        attributes: attributes.map((a) => ({
          trait_type: a.name,
          value: a.value,
        })),
      },
    });
  }
}
const api = createApi({ store, config });
api.listen(Number(process.env.MARKETPLACE_PORT ?? 3100), "127.0.0.1", () =>
  console.log(
    "Demo API running on http://127.0.0.1:3100 — illustrative data, trading disabled.",
  ),
);
