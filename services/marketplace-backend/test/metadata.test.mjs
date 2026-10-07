import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicAddress,
  decodeUri,
  normalizeMetadata,
} from "../src/metadata.mjs";
test("metadata fetch policy rejects internal/reserved destinations including IPv6", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.2",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
test("normalization keeps safe typed traits and decodes Cairo ByteArray URI", () => {
  const uri = "https://example.com/1";
  const felt = "0x" + Buffer.from(uri).toString("hex");
  assert.equal(decodeUri(["0", felt, String(uri.length)]), uri);
  const m = normalizeMetadata({
    name: "Beast",
    attributes: [
      { trait_type: "Health", value: "120" },
      { trait_type: "Shiny", value: true },
      { trait_type: "Power", value: "9007199254740993" },
    ],
  });
  assert.equal(m.attributes[0].value, 120);
  assert.equal(m.attributes[1].value, true);
  assert.equal(m.attributes[2].value, "9007199254740993");
});
test("realm resources and boolean strings normalize consistently for server filters", () => {
  const m = normalizeMetadata({
    attributes: [
      { trait_type: "Resource", value: "Stone" },
      { trait_type: "Resource", value: "Wood" },
      { trait_type: "Resource", value: "Stone" },
      { trait_type: "Alive", value: "false" },
    ],
  });
  assert.equal(m.resourceCount, 2);
  assert.equal(m.attributes.at(-1).value, false);
});
