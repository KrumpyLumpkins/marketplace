import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { address } from "../src/domain.mjs";
const block = (number, parentHash, events = []) => ({
  number,
  hash: `0x${(number + 100).toString(16)}`,
  parentHash,
  timestamp: 100 + number,
  events,
});
const transfer = (tokenId, to) => ({
  type: "transfer",
  collection: address("0x9"),
  tokenId,
  from: address("0x0"),
  to: address(to),
  transactionHash: "0xaa",
  eventIndex: Number(tokenId),
});
test("projection and checkpoint are atomic, repeated input is idempotent, fork rewind restores owners", () => {
  const s = new Store(":memory:");
  s.applyBlock(block(1, "0x0", [transfer("1", "0x2")]));
  s.applyBlock(block(1, "0x0", [transfer("1", "0x2")]));
  assert.equal(s.list("token").length, 1);
  s.applyBlock(block(2, "0x65", [transfer("1", "0x3")]));
  assert.equal(s.get("token", `${address("0x9")}:1`).owner, address("0x3"));
  s.rewind(1);
  assert.equal(s.get("token", `${address("0x9")}:1`).owner, address("0x2"));
  assert.equal(s.head().number, 1);
  assert.throws(() =>
    s.applyBlock(block(2, "0x65", [transfer("2", "0x3"), { type: "invalid" }])),
  );
  assert.equal(s.list("token").length, 1);
  assert.equal(s.head().number, 1);
  s.close();
});
test("terminal order events require creation and notifications survive replay with invalidation", () => {
  const s = new Store(":memory:");
  assert.throws(() =>
    s.applyBlock(
      block(1, "0x0", [{ type: "order_cancelled", key: "missing" }]),
    ),
  );
  s.applyBlock(
    block(1, "0x0", [
      {
        type: "order_created",
        key: "a",
        maker: address("0x2"),
        nonce: "1",
        kind: "listing",
        collection: address("0x9"),
        tokenId: "1",
        currency: address("0x8"),
        buyerDebit: "100",
        expiry: "999",
        royaltyAmount: "0",
        royaltyCap: "0",
        royaltyRecipient: address("0x0"),
      },
    ]),
  );
  s.applyBlock(
    block(2, "0x65", [
      {
        type: "order_filled",
        key: "a",
        buyer: address("0x3"),
        seller: address("0x2"),
        tokenId: "1",
        buyerDebit: "100",
        sellerProceeds: "98",
        protocolFee: "2",
        royaltyAmount: "0",
        currency: address("0x8"),
      },
    ]),
  );
  assert.equal(s.get("order", "a").state, "filled");
  assert.equal(s.notifications(address("0x2")).length, 1);
  s.rewind(1);
  assert.equal(s.get("order", "a").state, "open");
  assert.equal(s.notifications(address("0x2"))[0].canonical, false);
  s.close();
});

test("offer notifications retain their event-time recipient when ownership changes", () => {
  const s = new Store(":memory:");
  const collection = address("9"),
    maker = address("3");
  s.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 1,
    events: [
      { type: "transfer", collection, tokenId: "1", from: "0", to: "2" },
      {
        type: "order_created",
        key: "offer",
        maker,
        nonce: "1",
        kind: "token_offer",
        collection,
        tokenId: "1",
        currency: address("8"),
        buyerDebit: "100",
        expiry: "9999999999",
      },
    ],
  });
  assert.equal(s.notifications("2").length, 1);
  s.applyBlock({
    number: 2,
    hash: "0x2",
    parentHash: "0x1",
    timestamp: 2,
    events: [
      { type: "transfer", collection, tokenId: "1", from: "2", to: "4" },
    ],
  });
  assert.equal(s.notifications("4").length, 0);
  assert.equal(s.notifications("2")[0].canonical, true);
  s.close();
});
test("floor history and daily sale aggregates roll back with their source blocks", () => {
  const s = new Store(":memory:"),
    collection = address("9"),
    currency = address("8");
  s.applyBlock({
    number: 1,
    hash: "0x1",
    parentHash: "0x0",
    timestamp: 100,
    events: [
      { type: "transfer", collection, tokenId: "1", from: "0", to: "2" },
      {
        type: "order_created",
        key: "listing",
        maker: address("2"),
        nonce: "1",
        kind: "listing",
        collection,
        tokenId: "1",
        currency,
        buyerDebit: "100",
        expiry: "200",
      },
    ],
  });
  assert.equal(s.list("floor_history")[0].price, "100");
  s.applyBlock({
    number: 2,
    hash: "0x2",
    parentHash: "0x1",
    timestamp: 101,
    events: [
      {
        type: "order_filled",
        key: "listing",
        buyer: address("3"),
        seller: address("2"),
        collection,
        tokenId: "1",
        currency,
        buyerDebit: "100",
      },
    ],
  });
  assert.equal(s.list("stats_day")[0].volume, "100");
  assert.equal(s.list("floor_current")[0].price, null);
  s.rewind(1);
  assert.equal(s.list("stats_day").length, 0);
  assert.equal(s.list("floor_current")[0].price, "100");
  s.close();
});
test("admin transfer clears the nomination and rewind restores it", () => {
  const s = new Store(":memory:");
  s.applyBlock(
    block(1, "0x0", [
      {
        type: "initialized",
        version: 1,
        admin: address("2"),
        feeBps: 200,
        feeRecipient: address("4"),
        paused: false,
      },
    ]),
  );
  s.applyBlock(
    block(2, "0x65", [{ type: "admin_proposed", admin: address("3") }]),
  );
  s.applyBlock(
    block(3, "0x66", [
      {
        type: "admin_transferred",
        previous: address("2"),
        admin: address("3"),
      },
    ]),
  );
  assert.equal(BigInt(s.get("config", "pending_admin").admin), 0n);
  s.rewind(2);
  assert.equal(s.get("config", "pending_admin").admin, address("3"));
  assert.equal(s.get("config", "marketplace").admin, address("2"));
  s.close();
});

test('fee updates replay and rewind without rewriting order snapshots', () => {
  const s=new Store(':memory:');
  s.applyBlock(block(1,'0x0',[{type:'initialized',feeBps:200,feeRecipient:address('40')},{type:'order_created',key:'fee-order',kind:'listing',feeBps:200,collection:address('9'),tokenId:'1',maker:address('2'),currency:address('8'),buyerDebit:'100',expiry:'999'}]));
  s.applyBlock(block(2,'0x65',[{type:'fee_policy_changed',feeBps:500,feeRecipient:address('60')}]));
  assert.equal(s.get('config','marketplace').feeBps,500);
  assert.equal(s.get('config','marketplace').feeRecipient,address('60'));
  assert.equal(s.get('order','fee-order').feeBps,200);
  s.rewind(1);
  assert.equal(s.get('config','marketplace').feeBps,200);
  assert.equal(s.get('config','marketplace').feeRecipient,address('40'));
  s.close();
});
