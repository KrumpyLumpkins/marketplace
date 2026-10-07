import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync } from "node:fs";
import { Store } from "../services/marketplace-backend/src/store.mjs";
import { Catalog } from "../services/marketplace-backend/src/catalog.mjs";
import { address } from "../services/marketplace-backend/src/domain.mjs";
const store = new Store(":memory:"),
  collection = address("9"),
  currency = address("8"),
  now = Math.floor(Date.now() / 1000),
  count = 10000;
store.db.exec("BEGIN");
store.put("collection", collection, {
  address: collection,
  name: "Load fixture",
});
for (let i = 0; i < count; i++) {
  store.put("token", `${collection}:${i}`, {
    id: `${collection}:${i}`,
    collection,
    tokenId: String(i),
    owner: address("2"),
    attributes: [{ name: "Power", value: i % 100 }],
    metadata: { name: `NFT ${i}` },
  });
  if (i % 5 === 0)
    store.put("order", String(i), {
      id: String(i),
      collection,
      tokenId: String(i),
      maker: address("2"),
      kind: "listing",
      state: "open",
      currency,
      buyerDebit: String(1000 + i),
      expiry: String(now + 3600),
    });
}
store.db.exec("COMMIT");
const catalog = new Catalog(store, {
  currencies: [{ address: currency, symbol: "TEST" }],
});
const times = [];
const queries = Number(process.env.BENCHMARK_QUERIES ?? 100);
for (let i = 0; i < queries; i++) {
  const start = performance.now();
  catalog.tokens(collection, {
    currency,
    sort: i % 2 ? "price-asc" : "power-desc",
    filters: [{ name: "Power", min: 40 }],
    limit: 50,
  });
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const result = {
  at: new Date().toISOString(),
  scope:
    "In-memory SQL only, synthetic 10,000 NFTs / 2,000 listings; not HTTP load or production storage",
  queries,
  p50Ms: times[Math.floor(queries / 2)],
  p95Ms: times[Math.min(queries - 1, Math.floor(queries * 0.95))],
  maxMs: times.at(-1),
};
mkdirSync(".context", { recursive: true });
writeFileSync(
  ".context/catalog-benchmark.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
store.close();
