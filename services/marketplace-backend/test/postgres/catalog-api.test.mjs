import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers.mjs";
import { migrate } from "../../src/postgres/migrate.mjs";
import { PgStore } from "../../src/postgres/store.mjs";
import { PgCatalog } from "../../src/postgres/catalog.mjs";
import { createApi } from "../../src/api.mjs";
import { Auth } from "../../src/auth.mjs";
import { address } from "../../src/domain.mjs";
const config = {
  chain: "LOCAL",
  chainId: "0x1",
  marketplace: address("99"),
  collections: [{ address: address("9"), startBlock: 1 }],
  currencies: [{ address: address("1"), symbol: "TEST", decimals: 18 }],
  origin: "https://market.example",
  operatorToken: "a".repeat(32),
};
async function fixture(t) {
  const db = await testDatabase(t),
    pool = db.pool();
  await migrate(pool);
  const store = new PgStore(pool);
  await store.put("collection", address("9"), {
    address: address("9"),
    name: "Realms",
  });
  for (const [id, power] of [
    ["9007199254740993", 90],
    ["2", 20],
    ["10", 50],
  ]) {
    const key = `${address("9")}:${id}`;
    await store.put("token", key, {
      id: key,
      collection: address("9"),
      tokenId: id,
      owner: address("2"),
      firstSeenBlock: 1,
    });
    await store.putMetadata(key, {
      metadata: { name: `Realm ${id}` },
      attributes: [
        { name: "Power", value: power },
        { name: "Alive", value: true },
      ],
    });
  }
  return { store, pool, catalog: new PgCatalog(store, config) };
}
test("PostgreSQL catalog preserves full-collection filtering, lossless ordering, scoped pagination and metadata facets", async (t) => {
  const { catalog, store } = await fixture(t);
  const page = await catalog.tokens("9", { limit: 1 });
  assert.equal(page.items[0].tokenId, "2");
  assert.equal(
    (await catalog.tokens("9", { limit: 1, cursor: page.nextCursor })).items[0]
      .tokenId,
    "10",
  );
  const filtered = await catalog.tokens("9", {
    filters: [{ name: "Power", min: 60 }],
    limit: 1,
  });
  assert.equal(filtered.items[0].tokenId, "9007199254740993");
  await assert.rejects(
    catalog.tokens("9", {
      filters: [{ name: "Power", min: 60 }],
      cursor: page.nextCursor,
    }),
    /Cursor/,
  );
  assert.equal(
    (await catalog.traits("9")).find((x) => x.name === "Alive").values[0].value,
    true,
  );
  assert.equal((await catalog.holdings("2")).items.length, 3);
  assert.equal((await catalog.holdings("3")).items.length, 0);
  assert.equal(
    (await catalog.search("9007199254740993")).tokens[0].tokenId,
    "9007199254740993",
  );
  for (const [i, tokenId] of ["2", "10", "9007199254740993"].entries())
    await store.put("order", "order-" + i, {
      id: "order-" + i,
      kind: "listing",
      state: "open",
      maker: address("2"),
      nonce: String(i + 1),
      collection: address("9"),
      tokenId,
      currency: address("1"),
      buyerDebit: (2n ** 200n + BigInt(i)).toString(),
      expiry: "18446744073709551615",
      feeBps: 500,
    });
  const offers = await catalog.tokens("9", {
    listedOnly: true,
    currency: "1",
    sort: "price-desc",
    limit: 1,
  });
  assert.equal(
    offers.items[0].bestListing.buyerDebit,
    (2n ** 200n + 2n).toString(),
  );
  assert.equal(
    (
      await catalog.tokens("9", {
        listedOnly: true,
        currency: "1",
        sort: "price-desc",
        cursor: offers.nextCursor,
        limit: 1,
      })
    ).items[0].tokenId,
    "10",
  );
  assert.equal(
    (await catalog.collection("9")).floorByCurrency[0].price,
    (2n ** 200n).toString(),
  );
});
test("PostgreSQL HTTP reads use independent snapshots and application writes preserve authorization boundaries", async (t) => {
  const { store } = await fixture(t);
  const api = createApi({ store, config });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const root = `http://127.0.0.1:${api.address().port}/v1/chains/LOCAL`;
  const replies = await Promise.all(
    Array.from({ length: 12 }, () =>
      fetch(root + "/collections/9/tokens").then((r) => r.json()),
    ),
  );
  assert.ok(replies.every((r) => r.data?.items.length === 3));
  const denied = await fetch(root + "/operator/collections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: "9", hidden: true }),
  });
  assert.equal(denied.status, 403);
  const hidden = await fetch(root + "/operator/collections", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + config.operatorToken,
    },
    body: JSON.stringify({ address: "9", hidden: true, verified: true }),
  });
  assert.equal(hidden.status, 200);
  assert.equal((await fetch(root + "/collections/9")).status, 404);
  assert.equal(
    (await fetch(root + "/search?q=Realm").then((r) => r.json())).data.tokens
      .length,
    0,
  );
});
test("PostgreSQL challenge consumption permits exactly one concurrent signature redemption", async (t) => {
  const { store, pool } = await fixture(t);
  let release;
  const gate = new Promise((r) => (release = r));
  let calls = 0;
  const auth = new Auth(store, {
    origin: config.origin,
    chainId: config.chainId,
    verify: async () => {
      if (++calls === 2) release();
      await gate;
      return true;
    },
  });
  const challenge = await auth.challenge("2", config.origin);
  const attempts = await Promise.allSettled([
    auth.verify(challenge.id, ["1"]),
    auth.verify(challenge.id, ["1"]),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await pool.query("SELECT COUNT(*) FROM app.sessions")).rows[0].count,
    "1",
  );
  const session = attempts.find((r) => r.status === "fulfilled").value;
  assert.equal(await auth.account(session.token), address("2"));
  await auth.logout(session.token);
  assert.equal(await auth.account(session.token), null);
});

test("Migration maintenance freezes application writes while keeping reads available", async (t) => {
  const { store, pool } = await fixture(t);
  const api = createApi({ store, config: { ...config, maintenance: true } });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const root = `http://127.0.0.1:${api.address().port}/v1/chains/LOCAL`;
  assert.equal((await fetch(root + "/collections/9/tokens")).status, 200);
  const response = await fetch(root + "/operator/collections", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + config.operatorToken,
    },
    body: JSON.stringify({ address: "9", hidden: true }),
  });
  assert.equal(response.status, 503);
  assert.equal(
    (await pool.query("SELECT COUNT(*) FROM app.moderation")).rows[0].count,
    "0",
  );
});

test("a failed snapshot release still returns the API error without rejecting the request handler", async (t) => {
  const { store } = await fixture(t);
  const begin = store.beginSnapshot.bind(store);
  store.beginSnapshot = async () => {
    const snapshot = await begin(),
      end = snapshot.endSnapshot.bind(snapshot);
    snapshot.endSnapshot = async () => {
      await end();
      throw new Error("Disconnected during cleanup");
    };
    return snapshot;
  };
  const api = createApi({ store, config });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => {
    api.closeAllConnections();
    api.close();
  });
  const response = await fetch(
    `http://127.0.0.1:${api.address().port}/v1/chains/LOCAL/unknown`,
    { signal: AbortSignal.timeout(3000) },
  );
  assert.equal(response.status, 404);
});
