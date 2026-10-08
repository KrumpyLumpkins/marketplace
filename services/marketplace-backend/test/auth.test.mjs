import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Store } from "../src/store.mjs";
import { Auth, loginHash } from "../src/auth.mjs";
const schema = JSON.parse(
  readFileSync(
    new URL("../../../config/marketplace/auth-schema.json", import.meta.url),
  ),
);
test("native SNIP-12 login hash matches independent Starknet.js vector", () =>
  assert.equal(
    loginHash(schema.vector.typedData, schema.vector.account),
    schema.vector.hash,
  ));
test("sessions require a valid signature and challenges are single use and origin bound", async () => {
  const s = new Store(":memory:");
  let expected;
  const auth = new Auth(s, {
    chainId: "SN_SEPOLIA",
    origin: "https://market.example",
    verify: async (account, hash, signature) =>
      hash === expected && signature[0] === "123",
  });
  await assert.rejects(() => auth.challenge("0x123", "https://evil.example"));
  const challenge = await auth.challenge("0x123", "https://market.example");
  expected = challenge.hash;
  await assert.rejects(auth.verify(challenge.id, ["bad"]));
  const session = await auth.verify(challenge.id, ["123"]);
  assert.equal(
    await auth.account(session.token),
    "0x" + "123".padStart(64, "0"),
  );
  await assert.rejects(auth.verify(challenge.id, ["123"]));
  await auth.logout(session.token);
  assert.equal(await auth.account(session.token), null);
  s.close();
});
