import { runtime } from "./runtime.mjs";
import { createApi } from "./api.mjs";
import { address, orderKey } from "./domain.mjs";
if (process.env.MARKETPLACE_STORE === "postgres" || process.env.DATABASE_URL) throw new Error("Demo seeding requires a separate local SQLite fixture environment.");
const { store, config } = await runtime({
  ...process.env,
  MARKETPLACE_DB:
    process.env.MARKETPLACE_DB ??
    "services/marketplace-backend/data/demo.sqlite",
});
config.demo = true;
config.marketplace = address("0x900");
config.marketplaceStartBlock = 1;
if (!store.head()) {
  const DAY = 86400,
    now = Math.floor(Date.now() / 1000),
    genesis = now - 31 * DAY,
    currencies = config.currencies.map((c) => address(c.address)),
    strk = currencies[0],
    lords = currencies[1] ?? strk,
    feeBps = 200,
    feeRecipient = address("40"),
    sources = [
      ...config.collections.map((c) => address(c.address)),
      config.marketplace,
    ];
  const REALM_RESOURCES = [
    "Wood", "Stone", "Coal", "Copper", "Obsidian", "Silver", "Ironwood",
    "Cold Iron", "Gold", "Hartwood", "Diamonds", "Sapphire", "Ruby",
    "Deep Crystal", "Ignium", "Ethereal Silica", "True Ice", "Twilight Quartz",
    "Alchemical Silver", "Adamantine", "Mithral", "Dragonhide",
  ];
  const ORDERS = ["Power", "Giants", "Titans", "Skill", "Perfection", "Brilliance", "Enlightenment", "Protection", "Anger", "Rage", "Fury", "Vitriol", "the Fox", "Detection", "Reflection", "the Twins"];
  const WONDERS = ["The Eternal Orchard", "The Pearl Summit", "The Glowing Geyser", "Sky Mast", "Altar Of Divine Will"];
  const banners = {
    Realms: "realms.png",
    Beasts: "beasts.jpg",
    Adventurers: "adventurers.png",
    "Golden Token": "golden-token.png",
    "Loot Chests": "loot-chests.png",
  };
  const nonces = new Map();
  const nextNonce = (maker) => {
    const n = (nonces.get(maker) ?? 0) + 1;
    nonces.set(maker, n);
    return String(n);
  };
  const owners = new Map();
  const ownerKey = (collection, tokenId) => `${collection}:${tokenId}`;
  const strkPrice = (i, dayIndex) =>
    (BigInt(10 + i) * 10n ** 18n * BigInt(100 + dayIndex * 3 + ((dayIndex * 7 + i) % 11))) / 100n;
  const lordsPrice = (i, dayIndex) => strkPrice(i, dayIndex) * 40n;
  const listing = (maker, collection, tokenId, currency, buyerDebit, expiry) => {
    const nonce = nextNonce(maker);
    return {
      type: "order_created",
      key: orderKey(config.chain, config.marketplace, maker, nonce),
      maker,
      nonce,
      kind: "listing",
      collection,
      tokenId,
      currency,
      buyerDebit: buyerDebit.toString(),
      expiry: String(expiry),
      royaltyCap: "0",
      feeBps,
      royaltyAmount: "0",
      royaltyRecipient: address("0"),
    };
  };
  const offer = (maker, collection, tokenId, currency, buyerDebit, expiry) => {
    const nonce = nextNonce(maker);
    return {
      type: "order_created",
      key: orderKey(config.chain, config.marketplace, maker, nonce),
      maker,
      nonce,
      kind: tokenId == null ? "collection_offer" : "token_offer",
      collection,
      tokenId,
      currency,
      buyerDebit: buyerDebit.toString(),
      expiry: String(expiry),
      royaltyCap: "0",
      feeBps,
      royaltyAmount: "0",
      royaltyRecipient: address("0"),
    };
  };
  const fill = (order, buyer) => {
    const debit = BigInt(order.buyerDebit),
      protocolFee = (debit * BigInt(feeBps)) / 10000n;
    return {
      type: "order_filled",
      key: order.key,
      maker: order.maker,
      nonce: order.nonce,
      buyer,
      seller: order.maker,
      collection: order.collection,
      tokenId: order.tokenId,
      currency: order.currency,
      buyerDebit: order.buyerDebit,
      sellerProceeds: (debit - protocolFee).toString(),
      protocolFee: protocolFee.toString(),
      feeRecipient,
      royaltyAmount: "0",
      royaltyRecipient: address("0"),
    };
  };
  const blocks = [];
  const pushBlock = (timestamp, events) => {
    const number = blocks.length + 1;
    blocks.push({
      number,
      hash: `0x${number.toString(16)}`,
      parentHash: number === 1 ? "0x0" : `0x${(number - 1).toString(16)}`,
      timestamp,
      events,
      sources,
    });
  };

  // Block 1: deployment, policies and mints 31 days ago.
  const genesisEvents = [
    {
      type: "initialized",
      version: 1,
      admin: address("10"),
      feeBps,
      feeRecipient,
      paused: false,
    },
  ];
  for (const c of config.collections) {
    const collection = address(c.address);
    store.put("collection", collection, {
      ...c,
      address: collection,
      verified: true,
      image: `/banners/${banners[c.name] ?? "realms.png"}`,
    });
    genesisEvents.push({
      type: "collection_policy",
      address: collection,
      enabled: true,
      royalties: true,
    });
    for (let i = 1; i <= 12; i++) {
      const to = address(i % 3 === 0 ? "2" : "1");
      owners.set(ownerKey(collection, String(i)), to);
      genesisEvents.push({
        type: "transfer",
        collection,
        tokenId: String(i),
        from: address("0"),
        to,
      });
    }
  }
  for (const currency of currencies)
    genesisEvents.push({ type: "currency_policy", address: currency, enabled: true });
  pushBlock(genesis, genesisEvents);

  // Daily blocks: a listing, its sale and the transfer, so statistics, floor history and activity have shape.
  const buyers = ["2", "3", "4", "5"].map((n) => address(n));
  const soldTokens = [2, 5, 8, 11, 6, 9];
  for (let dayIndex = 1; dayIndex <= 30; dayIndex++) {
    const timestamp = genesis + dayIndex * DAY + 3600 * ((dayIndex * 5) % 20);
    const events = [];
    config.collections.forEach((c, collectionIndex) => {
      if ((dayIndex + collectionIndex) % 2 !== 0) return;
      const collection = address(c.address),
        tokenId = String(soldTokens[(dayIndex + collectionIndex) % soldTokens.length]),
        seller = owners.get(ownerKey(collection, tokenId)),
        buyer = buyers.find((b) => b !== seller) ?? buyers[0],
        useLords = dayIndex % 3 === 0,
        price = useLords ? lordsPrice(Number(tokenId), dayIndex) : strkPrice(Number(tokenId), dayIndex),
        order = listing(seller, collection, tokenId, useLords ? lords : strk, price, timestamp + 7 * DAY);
      events.push(order, fill(order, buyer), {
        type: "transfer",
        collection,
        tokenId,
        from: seller,
        to: buyer,
      });
      owners.set(ownerKey(collection, tokenId), buyer);
    });
    if (events.length) pushBlock(timestamp, events);
  }

  // Head block: today's open listings and offers.
  const headEvents = [];
  for (const c of config.collections) {
    const collection = address(c.address);
    for (let i = 1; i <= 12; i++) {
      const owner = owners.get(ownerKey(collection, String(i)));
      if (i % 3 !== 0)
        headEvents.push(listing(owner, collection, String(i), strk, strkPrice(i, 31), now + 30 * DAY));
      if (i % 4 === 0)
        headEvents.push(listing(owner, collection, String(i), lords, lordsPrice(i, 31) - 10n ** 18n, now + 14 * DAY));
    }
    headEvents.push(
      offer(address("6"), collection, "1", strk, strkPrice(1, 28), now + 3 * DAY),
      offer(address("7"), collection, null, strk, strkPrice(1, 24), now + 5 * DAY),
      offer(address("8"), collection, "2", lords, lordsPrice(2, 20), now + 2 * DAY),
    );
  }
  pushBlock(now, headEvents);
  for (const block of blocks) store.applyBlock(block);

  for (const token of store.list("token")) {
    const c = config.collections.find(
        (c) => address(c.address) === token.collection,
      ),
      i = Number(token.tokenId);
    const image = `/banners/${banners[c.name] ?? "realms.png"}`;
    let attributes;
    if (c.name === "Realms") {
      const count = 2 + (i % 5),
        resources = Array.from({ length: count }, (_, k) => REALM_RESOURCES[(i * 7 + k * 5) % REALM_RESOURCES.length]);
      attributes = [
        ...resources.map((value) => ({ name: "Resource", value })),
        { name: "Cities", value: 4 + (i % 18) },
        { name: "Harbors", value: i % 8 },
        { name: "Rivers", value: i % 11 },
        { name: "Regions", value: 2 + (i % 6) },
        { name: "Order", value: ORDERS[i % ORDERS.length] },
        ...(i % 5 === 0 ? [{ name: "Wonder", value: WONDERS[i % WONDERS.length] }] : []),
      ];
    } else {
      attributes = [
        { name: "Level", value: i * 3 },
        { name: "Power", value: i * 17 },
        { name: "Health", value: 100 + i },
        { name: "Tier", value: (i % 4) + 1 },
        { name: "Shiny", value: i % 2 === 0 },
        { name: "Resource", value: i % 2 ? "Gold" : "Wood" },
      ];
    }
    store.put("token", token.id, {
      ...token,
      attributes,
      image,
      resourceCount: attributes.filter((a) => a.name === "Resource").length,
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
