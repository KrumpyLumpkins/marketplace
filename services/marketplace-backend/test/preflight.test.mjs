import { test } from "node:test";
import assert from "node:assert/strict";
import { preflight } from "../src/preflight.mjs";
import { Store } from "../src/store.mjs";
import { address } from "../src/domain.mjs";
test("preflight fails closed without deployed identity and never treats missing data as zero fee", async () => {
  const s = new Store(":memory:");
  const cfg = {
    chain: "LOCAL",
    marketplace: null,
    collections: [],
    currencies: [],
  };
  const result = await preflight(s, null, cfg, {
    account: "0x2",
    items: [{ maker: "0x3", nonce: "1" }],
  });
  assert.equal(result.canSubmit, false);
  assert.ok(result.reasons.includes("MARKETPLACE_NOT_DEPLOYED"));
  s.close();
});
test("duplicate cart identities are rejected before any RPC calls", async () => {
  const s = new Store(":memory:");
  const cfg = {
    chain: "LOCAL",
    marketplace: address("99"),
    collections: [],
    currencies: [],
  };
  await assert.rejects(
    preflight(s, null, cfg, {
      account: "2",
      items: [
        { maker: "3", nonce: "1" },
        { maker: "3", nonce: "1" },
      ],
    }),
    /Duplicate/,
  );
  s.close();
});
