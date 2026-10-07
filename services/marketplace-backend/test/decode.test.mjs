import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEvent, SELECTORS } from "../src/decode.mjs";
import { address } from "../src/domain.mjs";
const cfg = {
  chain: "LOCAL",
  marketplace: "0x99",
  collections: [{ address: "0x9" }],
};
test("decodes full order terms losslessly, explicitly distinguishes collection wildcard from token zero", () => {
  const raw = {
    from_address: "0x99",
    keys: [SELECTORS.OrderCreated, "0x2", "1"],
    data: [
      "3",
      "0x9",
      "0",
      "0",
      "0x8",
      "9007199254740993",
      "0",
      "1000",
      "10",
      "0",
      "0",
      "0",
      "0",
    ],
  };
  const order = decodeEvent(raw, cfg);
  assert.equal(order.kind, "collection_offer");
  assert.equal(order.tokenId, null);
  assert.equal(order.buyerDebit, "9007199254740993");
  raw.data[0] = "1";
  assert.equal(decodeEvent(raw, cfg).tokenId, "0");
  assert.throws(() =>
    decodeEvent({ ...raw, data: raw.data.slice(0, -1) }, cfg),
  );
});
test("handles keyed or data ERC721 events and refuses unknown marketplace schemas", () => {
  const base = {
    from_address: "0x9",
    keys: [SELECTORS.Transfer],
    data: ["0", "0x2", "5", "0"],
  };
  assert.equal(decodeEvent(base, cfg).to, address("0x2"));
  assert.equal(
    decodeEvent({ ...base, keys: [...base.keys, ...base.data], data: [] }, cfg)
      .tokenId,
    "5",
  );
  assert.throws(() =>
    decodeEvent({ from_address: "0x99", keys: ["0xdead"], data: [] }, cfg),
  );
  assert.equal(
    decodeEvent({ from_address: "0xdead", keys: ["0x1"], data: [] }, cfg),
    null,
  );
});
