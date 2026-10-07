import { test } from "node:test";
import assert from "node:assert/strict";
import {
  address,
  uint,
  allocations,
  orderKey,
  evaluateOrder,
} from "../src/domain.mjs";

test("chain values normalize without losing precision and reject malformed bounds", () => {
  assert.equal(uint("0x20000000000001"), "9007199254740993");
  assert.equal(address("0XABC"), address("0x0abc"));
  for (const bad of [-1, 9007199254740992, "1.5", "", "-2"])
    assert.throws(() => uint(bad));
  assert.throws(() => uint(1n << 256n));
  assert.throws(() => address(1n << 251n));
});
test("fees cannot increase maker debit, even at uint256 boundary", () => {
  for (const p of [1n, 100n, (1n << 256n) - 1n]) {
    const a = allocations(p, 500, 0);
    assert.equal(
      BigInt(a.sellerProceeds) +
        BigInt(a.protocolFee) +
        BigInt(a.royaltyAmount),
      p,
    );
    assert.equal(a.buyerDebit, p.toString());
  }
  assert.deepEqual(allocations(100, 200, 5), {
    buyerDebit: "100",
    protocolFee: "2",
    royaltyAmount: "5",
    sellerProceeds: "93",
  });
  assert.throws(() => allocations(100, 501, 0));
  assert.throws(() => allocations(100, 0, 100));
});
test("identity includes deployment, maker and nonce", () => {
  const a = orderKey("SN_MAIN", "0x1", "0x2", "3");
  assert.notEqual(a, orderKey("SN_SEPOLIA", "0x1", "0x2", "3"));
  assert.notEqual(a, orderKey("SN_MAIN", "0x9", "0x2", "3"));
});
test("order availability distinguishes terminal state, expiry, funds and own listings", () => {
  const order = {
    kind: "listing",
    state: "open",
    maker: address("0x2"),
    expiry: "100",
    buyerDebit: "10",
  };
  assert.equal(
    evaluateOrder(order, { now: 100, buyer: "0x3", owner: "0x2" }),
    "expired",
  );
  assert.equal(
    evaluateOrder({ ...order, state: "cancelled" }, { now: 1 }),
    "cancelled",
  );
  assert.equal(
    evaluateOrder(order, { now: 1, buyer: "0x2", owner: "0x2" }),
    "own_listing",
  );
  assert.equal(
    evaluateOrder(order, { now: 1, buyer: "0x3", owner: "0x4" }),
    "transferred",
  );
  assert.equal(
    evaluateOrder(order, { now: 1, buyer: "0x3", owner: "0x2" }),
    "available",
  );
});
