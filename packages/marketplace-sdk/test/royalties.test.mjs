import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionRoyaltyLimit } from "../dist/index.js";
test("reviewed royalty ceiling handles address padding and mixed collections without guessing unknown terms", () => {
  const registry = [{ address: "0x1" }, { address: "0x02", royaltyBps: 500 }];
  assert.equal(collectionRoyaltyLimit(registry, ["0x01"]), "0");
  assert.equal(collectionRoyaltyLimit(registry, ["0x1", "0x2"]), "5");
  assert.throws(() => collectionRoyaltyLimit(registry, ["0x3"]), /reviewed/);
  assert.throws(
    () => collectionRoyaltyLimit([{ address: "0x2", royaltyBps: -1 }], ["0x2"]),
    /royalty/,
  );
});

test("disabled collections cannot prepare reviewed trading terms", () => {
  assert.throws(
    () =>
      collectionRoyaltyLimit(
        [{ address: "0x1", royaltyBps: 500, enabled: false }],
        ["0x1"],
      ),
    /Trading is not enabled/,
  );
});
