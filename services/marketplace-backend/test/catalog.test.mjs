import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { Catalog } from "../src/catalog.mjs";
import { address } from "../src/domain.mjs";
function fixture() {
  const s = new Store(":memory:");
  s.put("collection", address("9"), {
    address: address("9"),
    name: "Beasts",
    verified: true,
  });
  for (const [id, power] of [
    ["9007199254740993", 90],
    ["2", 20],
    ["10", 50],
  ])
    s.put("token", `${address("9")}:${id}`, {
      id: `${address("9")}:${id}`,
      collection: address("9"),
      tokenId: id,
      owner: address("2"),
      attributes: [{ name: "Power", value: power }],
      metadata: { name: `Beast ${id}` },
      firstSeenBlock: 1,
    });
  return s;
}
test("filters before pagination and sorts IDs numerically with scope-bound cursors", () => {
  const s = fixture(),
    c = new Catalog(s, {
      chain: "LOCAL",
      marketplace: address("99"),
      currencies: [],
    });
  const all = c.tokens(address("9"), { limit: 1, sort: "token-asc" });
  assert.equal(all.items[0].tokenId, "2");
  assert.equal(
    c.tokens(address("9"), {
      limit: 1,
      sort: "token-asc",
      cursor: all.nextCursor,
    }).items[0].tokenId,
    "10",
  );
  const filtered = c.tokens(address("9"), {
    filters: [{ name: "Power", min: 60 }],
    limit: 1,
  });
  assert.equal(filtered.items[0].tokenId, "9007199254740993");
  assert.throws(() =>
    c.tokens(address("9"), {
      filters: [{ name: "Power", min: 60 }],
      cursor: all.nextCursor,
    }),
  );
  s.close();
});
test("trait facets count distinct matching tokens; holdings are account-scoped", () => {
  const s = fixture(),
    c = new Catalog(s, { chain: "LOCAL", currencies: [] });
  assert.equal(c.traits(address("9"), {}).length, 1);
  assert.equal(c.holdings("2", {}).items.length, 3);
  assert.equal(c.holdings("3", {}).items.length, 0);
  s.close();
});
test("sweep applies full-collection filters before limiting and returns only matching listed tokens", () => {
  const s = fixture(),
    c = new Catalog(s, { chain: "LOCAL", currencies: [] });
  for (const [id, price] of [
    ["2", "10"],
    ["10", "20"],
    ["9007199254740993", "30"],
  ])
    s.put("order", id, {
      id,
      kind: "listing",
      state: "open",
      maker: address("2"),
      collection: address("9"),
      tokenId: id,
      currency: address("1"),
      buyerDebit: price,
      expiry: String(Math.floor(Date.now() / 1000) + 1000),
    });
  const page = c.tokens("9", {
    listedOnly: true,
    currency: "1",
    sort: "price-asc",
    filters: [{ name: "Power", min: 60 }],
    limit: 25,
  });
  assert.deepEqual(
    page.items.map((t) => t.tokenId),
    ["9007199254740993"],
  );
  s.db.prepare("DELETE FROM entities WHERE kind='order'").run();
  assert.equal(
    c.tokens("9", { listedOnly: true, currency: "1", sort: "price-asc" }).items
      .length,
    0,
  );
  s.close();
});
test("moderated content is excluded from detail and global token discovery", () => {
  const s = fixture(),
    c = new Catalog(s, { chain: "LOCAL", currencies: [] });
  s.app.prepare("INSERT INTO moderation VALUES(?,?)").run(address("9"), "{}");
  assert.throws(() => c.collection("9"), { code: "CONTENT_RESTRICTED" });
  assert.equal(c.tokens(null).items.length, 0);
  s.close();
});
