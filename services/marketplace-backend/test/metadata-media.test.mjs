import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as metadata from "../src/metadata.mjs";
import { refreshMetadata } from "../src/metadata.mjs";
import { createMediaFetcher } from "../src/media-fetch.mjs";
import { Store } from "../src/store.mjs";
import { address } from "../src/domain.mjs";

const COLLECTION = address("0x9");
const CID = "QmS136SdgcHsiaKJdFVfQWNMS5tHHcbazbUxYqpUZKVEj6";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100%"/>';
const config = { chain: "LOCAL", ipfsGateway: "https://gw.example/ipfs" };
const tokenKey = (id) => `${COLLECTION}:${id}`;
const json = (raw) =>
  "data:application/json," + encodeURIComponent(JSON.stringify(raw));
/** Cairo ByteArray encoding of a token URI, as starknet_call returns it. */
function uriFelts(uri) {
  const bytes = Buffer.from(uri);
  const words = [];
  let i = 0;
  for (; i + 31 <= bytes.length; i += 31)
    words.push("0x" + bytes.subarray(i, i + 31).toString("hex"));
  const pending = bytes.subarray(i);
  return [
    String(words.length),
    ...words,
    pending.length ? "0x" + pending.toString("hex") : "0",
    String(pending.length),
  ];
}
/** RPC stub answering token_uri per token ID; calldata carries the u256 low word first. */
const rpcFor = (uris) => ({
  contract: async (_collection, _selector, calldata) =>
    uriFelts(uris[BigInt(calldata[0]).toString()]),
});
function seededStore(tokenIds = ["1"]) {
  const store = new Store(":memory:");
  store.applyBlock({
    number: 1,
    hash: "0x65",
    parentHash: "0x0",
    timestamp: 101,
    events: tokenIds.map((tokenId) => ({
      type: "transfer",
      collection: COLLECTION,
      tokenId,
      from: address("0x0"),
      to: address("0x2"),
      transactionHash: "0xaa",
      eventIndex: Number(tokenId),
    })),
  });
  return store;
}
function assetDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "market-metadata-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const makeEligible = (store, id) =>
  store.put("token", id, { ...store.get("token", id), metadataNextAttempt: 0 });

test("resolveMediaUri rewrites IPFS, Arweave and bare-CID forms and leaves http(s) and data: URIs alone", () => {
  const { resolveMediaUri } = metadata;
  const bafy = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  for (const gateway of ["https://gw.example/ipfs", "https://gw.example/ipfs/"]) {
    assert.equal(
      resolveMediaUri(`ipfs://${CID}/1.svg`, gateway),
      `https://gw.example/ipfs/${CID}/1.svg`,
    );
    assert.equal(
      resolveMediaUri(`ipfs://ipfs/${CID}`, gateway),
      `https://gw.example/ipfs/${CID}`,
    );
    assert.equal(resolveMediaUri(CID, gateway), `https://gw.example/ipfs/${CID}`);
    assert.equal(
      resolveMediaUri(`${bafy}/art.png`, gateway),
      `https://gw.example/ipfs/${bafy}/art.png`,
    );
    assert.equal(
      resolveMediaUri(`/ipfs/${CID}/1.svg`, gateway),
      `https://gw.example/ipfs/${CID}/1.svg`,
    );
  }
  assert.equal(
    resolveMediaUri("ar://abc_DEF-123", "https://gw.example/ipfs"),
    "https://arweave.net/abc_DEF-123",
  );
  for (const untouched of [
    "https://cdn.example/1.png",
    "http://cdn.example/1.png",
    `https://gw.example/ipfs/${CID}`,
    "data:image/png;base64,AAAA",
  ])
    assert.equal(resolveMediaUri(untouched, "https://gw.example/ipfs"), untouched);
});

test("parseDataUri decodes base64 and percent-encoded payloads and enforces the byte cap", () => {
  const { parseDataUri } = metadata;
  const textSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%"><text>50% off</text></svg>';
  assert.deepEqual(parseDataUri("data:image/svg+xml;utf8," + textSvg), {
    mime: "image/svg+xml",
    bytes: Buffer.from(textSvg),
  });
  assert.deepEqual(
    parseDataUri("data:image/svg+xml," + encodeURIComponent(textSvg)),
    { mime: "image/svg+xml", bytes: Buffer.from(textSvg) },
  );
  assert.deepEqual(parseDataUri("data:image/png;base64," + PNG.toString("base64")), {
    mime: "image/png",
    bytes: PNG,
  });
  assert.deepEqual(
    parseDataUri(
      "data:application/json;charset=utf-8;base64," +
        Buffer.from('{"a":1}').toString("base64"),
    ),
    { mime: "application/json", bytes: Buffer.from('{"a":1}') },
  );
  assert.equal(parseDataUri("https://cdn.example/1.png"), null);
  assert.throws(
    () => parseDataUri("data:image/png;base64," + Buffer.alloc(11).toString("base64"), 10),
    /size limit/,
  );
  assert.throws(
    () => parseDataUri("data:image/svg+xml,<svg>" + "a".repeat(32) + "</svg>", 16),
    /size limit/,
  );
});

test("imageExtension trusts declared image types and sniffs magic bytes only for generic content types", () => {
  const { imageExtension } = metadata;
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const gif = Buffer.from("GIF89a\0\0");
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
  const svg = Buffer.from(
    '﻿<?xml version="1.0"?>\n<!-- art -->\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  assert.equal(imageExtension("image/png", Buffer.alloc(0)), "png");
  assert.equal(imageExtension("image/svg+xml; charset=utf-8", Buffer.alloc(0)), "svg");
  assert.equal(imageExtension("application/octet-stream", PNG), "png");
  assert.equal(imageExtension("", jpg), "jpg");
  assert.equal(imageExtension(undefined, gif), "gif");
  assert.equal(imageExtension("text/plain", webp), "webp");
  assert.equal(imageExtension("text/xml", svg), "svg");
  assert.throws(
    () => imageExtension("application/octet-stream", Buffer.from("not an image")),
    /Unsupported image content type/,
  );
  assert.throws(() => imageExtension("text/html", svg), /Unsupported image content type/);
});

test("image download failure keeps the origin URL displayable and records the error", async (t) => {
  const store = seededStore(),
    origin = "https://cdn.example/1.png";
  await refreshMetadata(store, rpcFor({ 1: json({ name: "Realm", image: origin }) }), config, {
    assetDir: assetDir(t),
    fetchResource: async () => {
      throw new Error("Metadata HTTP 503");
    },
  });
  const token = store.get("token", tokenKey(1));
  assert.equal(token.metadataStatus, "ready");
  assert.equal(token.image, null, "nothing is cached yet");
  assert.equal(token.metadata.image, origin, "the origin stays displayable");
  assert.equal(token.metadata.imageSourceUri, origin);
  assert.equal(token.metadata.imageStatus, "failed");
  assert.equal(token.metadata.imageError, "Metadata HTTP 503");
});

test("failed images back off by attempt and cached tokens are rechecked every six hours", async (t) => {
  const store = seededStore(),
    dir = assetDir(t),
    id = tokenKey(1);
  const rpc = rpcFor({ 1: json({ name: "Realm", image: "https://cdn.example/1.svg" }) });
  let fail = true;
  const fetchResource = async () => {
    if (fail) throw new Error("Metadata HTTP 429");
    return { bytes: Buffer.from(SVG), contentType: "image/svg+xml" };
  };
  const schedule = [300000, 1800000, 7200000, 43200000, 86400000, 86400000];
  for (const [attempt, expected] of schedule.entries()) {
    const before = Date.now();
    await refreshMetadata(store, rpc, config, { assetDir: dir, fetchResource });
    const token = store.get("token", id);
    assert.equal(token.image, null);
    assert.equal(token.metadata.imageAttempts, attempt + 1);
    const delay = token.metadataNextAttempt - before;
    assert.ok(
      delay >= expected && delay < expected + 5000,
      `attempt ${attempt + 1} waits ${delay}ms, expected ${expected}ms`,
    );
    makeEligible(store, id);
  }
  fail = false;
  const before = Date.now();
  await refreshMetadata(store, rpc, config, { assetDir: dir, fetchResource });
  const token = store.get("token", id);
  assert.ok(token.image);
  assert.equal(token.metadata.imageAttempts, 0);
  const delay = token.metadataNextAttempt - before;
  assert.ok(delay >= 21600000 && delay < 21600000 + 5000, `cached tokens wait ${delay}ms`);
});

test("inline data: token URIs and images are decoded and cached without any network fetch", async (t) => {
  const store = seededStore(["1", "2"]),
    dir = assetDir(t);
  const svgUri = "data:image/svg+xml;utf8," + SVG;
  const uris = {
    1: json({ name: "Beast", image: svgUri }),
    2:
      "data:application/json;base64," +
      Buffer.from(
        JSON.stringify({
          name: "Adventurer",
          image: "data:image/png;base64," + PNG.toString("base64"),
        }),
      ).toString("base64"),
  };
  let fetches = 0;
  await refreshMetadata(store, rpcFor(uris), config, {
    assetDir: dir,
    fetchResource: async () => {
      fetches++;
      throw new Error("unexpected network fetch");
    },
  });
  assert.equal(fetches, 0);
  const beast = store.get("token", tokenKey(1)),
    adventurer = store.get("token", tokenKey(2));
  assert.match(
    beast.image,
    /^\/api\/marketplace\/v1\/chains\/LOCAL\/assets\/[a-f0-9]{64}\.svg$/,
  );
  assert.match(adventurer.image, /\.png$/);
  assert.equal(readFileSync(join(dir, beast.image.split("/").at(-1)), "utf8"), SVG);
  assert.deepEqual(readFileSync(join(dir, adventurer.image.split("/").at(-1))), PNG);
  assert.equal(beast.metadata.imageStatus, "ready");
  assert.equal(beast.metadata.imageSourceUri, svgUri);
  assert.equal(beast.metadata.name, "Beast");
  assert.equal(adventurer.metadata.name, "Adventurer");
});

test("token URI JSON downloads use the paced media fetcher and resolve ipfs:// through the gateway", async (t) => {
  const store = seededStore(),
    requests = [];
  let time = 0,
    rateLimited = true;
  const fetchMedia = createMediaFetcher(
    async (url) => {
      requests.push(url);
      if (url.endsWith("/1.json")) {
        if (rateLimited) {
          rateLimited = false;
          throw Object.assign(new Error("Metadata HTTP 429"), {
            status: 429,
            retryAfterMs: 5000,
          });
        }
        return {
          bytes: Buffer.from(JSON.stringify({ name: "Realm", image: `ipfs://${CID}/1.svg` })),
          contentType: "application/json",
        };
      }
      return { bytes: Buffer.from(SVG), contentType: "image/svg+xml" };
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    },
  );
  await refreshMetadata(store, rpcFor({ 1: `ipfs://${CID}/1.json` }), config, {
    assetDir: assetDir(t),
    fetchMedia,
  });
  const token = store.get("token", tokenKey(1));
  assert.equal(token.metadataStatus, "ready");
  assert.equal(token.metadata.name, "Realm");
  assert.ok(token.image);
  assert.deepEqual(requests, [
    `https://gw.example/ipfs/${CID}/1.json`,
    `https://gw.example/ipfs/${CID}/1.json`,
    `https://gw.example/ipfs/${CID}/1.svg`,
  ]);
  assert.ok(time >= 5000, "the 429 cooldown is honoured before the JSON retry");
});

test("generic gateway content types are sniffed and bare CID or /ipfs/ image paths resolve through the gateway", async (t) => {
  const store = seededStore(["1", "2"]),
    dir = assetDir(t),
    requests = [];
  const uris = {
    1: json({ name: "A", image: CID }),
    2: json({ name: "B", image: `/ipfs/${CID}/2.svg` }),
  };
  const fetchResource = async (url) => {
    requests.push(url);
    return url.endsWith("/2.svg")
      ? { bytes: Buffer.from('<?xml version="1.0"?>' + SVG), contentType: "text/xml" }
      : { bytes: PNG, contentType: "application/octet-stream" };
  };
  await refreshMetadata(
    store,
    rpcFor(uris),
    { ...config, ipfsGateway: "https://gw.example/ipfs/" },
    { assetDir: dir, fetchResource },
  );
  assert.deepEqual(requests.sort(), [
    `https://gw.example/ipfs/${CID}`,
    `https://gw.example/ipfs/${CID}/2.svg`,
  ]);
  assert.match(store.get("token", tokenKey(1)).image, /\.png$/);
  assert.match(store.get("token", tokenKey(2)).image, /\.svg$/);
  assert.equal(store.get("token", tokenKey(1)).metadata.imageStatus, "ready");
  assert.equal(readdirSync(dir).length, 2);
});
