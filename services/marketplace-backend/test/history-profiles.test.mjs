import { test } from "node:test";
import assert from "node:assert/strict";
import { historyProfiles } from "../src/history.mjs";
import { readFileSync } from "node:fs";
const registry = JSON.parse(
  readFileSync(
    new URL(
      "../../../config/marketplace/registry.expansion.json",
      import.meta.url,
    ),
  ),
);
test("historical profiles cover exactly the reviewed four collection identities", () => {
  const config = { ...registry.chains.SN_MAIN, chain: "SN_MAIN" };
  const profiles = historyProfiles(config);
  assert.equal(profiles.length, 4);
  assert.equal(profiles.filter((p) => p.supplyMode === "current").length, 2);
  assert.throws(
    () =>
      historyProfiles({
        ...config,
        collections: [
          ...config.collections,
          { address: "0x123", classHash: "0x1" },
        ],
      }),
    /profile/i,
  );
  assert.throws(
    () =>
      historyProfiles({
        ...config,
        collections: [{ ...config.collections[1], classHash: "0x1" }],
      }),
    /profile/i,
  );
  assert.throws(
    () =>
      historyProfiles({
        ...config,
        collections: [config.collections[0], config.collections[0]],
      }),
    /profile/i,
  );
});
