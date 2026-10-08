import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTransferLock } from "../src/collection-policy.mjs";
test("reviewed transfer locks block settlement and malformed responses fail closed", async () => {
  const config = {
    collections: [{ address: "0x1", transferLockSelector: "0xabc" }],
  };
  const block = { block_hash: "0x123" };
  let value = ["0"];
  const rpc = {
    contract: async (at, selector, args, atBlock) => {
      assert.equal(selector, "0xabc");
      assert.deepEqual(args, ["2", "0"]);
      assert.equal(atBlock, block);
      return value;
    },
  };
  await checkTransferLock(rpc, config, "0x01", "2", block);
  value = ["1"];
  await assert.rejects(checkTransferLock(rpc, config, "0x1", "2", block), {
    code: "TOKEN_LOCKED",
  });
  value = ["2"];
  await assert.rejects(checkTransferLock(rpc, config, "0x1", "2", block), {
    code: "LOCK_STATUS_UNAVAILABLE",
  });
  await checkTransferLock(
    {
      contract: () => {
        throw Error("Unexpected call");
      },
    },
    config,
    "0x3",
    "2",
    block,
  );
});
