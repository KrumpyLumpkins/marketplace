import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTokenMetadata,
  decodeInlineImage,
} from "../src/metadata-data.mjs";
import { decodeUri } from "../src/metadata.mjs";
test("reviewed legacy JSON repair only escapes raw controls inside strings", () => {
  const text = '{\n"description":"first\nsecond","quoted":"a\\\"b"\n}';
  assert.throws(() => parseTokenMetadata(text));
  assert.deepEqual(parseTokenMetadata(text, true), {
    description: "first\nsecond",
    quoted: 'a"b',
  });
  assert.throws(() => parseTokenMetadata('{"name":"broken}', true));
});
test("inline artwork is decoded without network access and bounded by type and bytes", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const result = decodeInlineImage(
    "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
  );
  assert.equal(result.bytes.toString(), svg);
  assert.equal(result.contentType, "image/svg+xml");
  assert.throws(() => decodeInlineImage("data:text/html;base64,PGgxPg=="));
  assert.throws(() => decodeInlineImage("data:image/png;base64,@@@"));
  assert.throws(() => decodeInlineImage("data:image/png;base64,YWJj", 2));
});
test("Cairo token URI accommodates inline artwork above 1024 words with a bounded limit", () => {
  const words = Array(1100).fill("0x" + Buffer.alloc(31, 65).toString("hex"));
  assert.equal(decodeUri(["1100", ...words, "0", "0"]).length, 34100);
  assert.throws(() => decodeUri(Array(70000).fill("0")), /Invalid token URI/);
});
