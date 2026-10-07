import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, u256Felts, numericKey, MAX_U256 } from "./domain.mjs";
import { SELECTORS } from "./decode.mjs";
export function publicAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(ip) === 6) {
    const parts = ip.split(":"),
      n = parseInt(parts[0], 16);
    return (
      n >= 0x2000 &&
      n < 0x4000 &&
      n !== 0x2002 &&
      !(n === 0x2001 && parseInt(parts[1] || "0", 16) < 0x200) &&
      !ip.toLowerCase().startsWith("2001:db8:")
    );
  }
  return false;
}
export async function fetchPublic(
  raw,
  { maxBytes = 2 * 1024 * 1024, redirects = 3 } = {},
) {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new ApiError("UNSAFE_URI", "Unsupported metadata URI.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((x) => !publicAddress(x.address)))
    throw new ApiError(
      "UNSAFE_URI",
      "Metadata destination is private or reserved.",
    );
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "accept-encoding": "identity",
          "user-agent": "BiblioMetadata/1",
        },
        timeout: 8000,
        lookup: (_h, opts, cb) =>
          opts.all
            ? cb(null, [addresses[0]])
            : cb(null, addresses[0].address, addresses[0].family),
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          if (redirects <= 0 || !res.headers.location) {
            reject(new Error("Redirect limit"));
            return;
          }
          fetchPublic(new URL(res.headers.location, url).href, {
            maxBytes,
            redirects: redirects - 1,
          }).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Metadata HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error("Metadata exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            contentType: String(res.headers["content-type"] ?? "").split(
              ";",
            )[0],
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Metadata timeout")));
    req.on("error", reject);
  });
}
function feltBytes(v, length) {
  const n = BigInt(v);
  if (n < 0n || n >= 1n << BigInt(length * 8))
    throw new Error("Invalid Cairo byte word");
  return length
    ? Buffer.from(n.toString(16).padStart(length * 2, "0"), "hex")
    : Buffer.alloc(0);
}
export function decodeUri(felts) {
  if (!Array.isArray(felts) || !felts.length || felts.length > 1024)
    throw new Error("Invalid token URI");
  if (felts.length === 1) {
    const h = BigInt(felts[0]).toString(16);
    return Buffer.from(h.length % 2 ? "0" + h : h, "hex").toString("utf8");
  }
  const count = Number(BigInt(felts[0]));
  if (count >= 0 && count + 3 === felts.length) {
    const pending = Number(BigInt(felts.at(-1)));
    if (pending < 0 || pending > 30) throw new Error("Invalid pending word");
    return Buffer.concat([
      ...felts.slice(1, 1 + count).map((f) => feltBytes(f, 31)),
      feltBytes(felts.at(-2), pending),
    ]).toString("utf8");
  }
  if (count + 1 === felts.length)
    return felts
      .slice(1)
      .map((f) => decodeUri([f]))
      .join("");
  throw new Error("Unsupported token URI encoding");
}
export function normalizeMetadata(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Metadata must be an object");
  const attributes = (Array.isArray(raw.attributes) ? raw.attributes : [])
    .slice(0, 200)
    .flatMap((a) => {
      if (!a || typeof a !== "object") return [];
      const name = String(a.trait_type ?? a.name ?? "").slice(0, 100);
      if (!name || !["string", "number", "boolean"].includes(typeof a.value))
        return [];
      let value = a.value;
      if (value === "true" || value === "false") value = value === "true";
      if (
        typeof value === "string" &&
        /^-?\d+(?:\.\d+)?$/.test(value) &&
        Number.isSafeInteger(Number(value))
      )
        value = Number(value);
      if (typeof value === "number" && !Number.isFinite(value)) return [];
      return [{ name, value }];
    });
  return {
    name: typeof raw.name === "string" ? raw.name.slice(0, 300) : null,
    description:
      typeof raw.description === "string"
        ? raw.description.slice(0, 5000)
        : null,
    image: typeof raw.image === "string" ? raw.image : null,
    attributes,
    resourceCount: new Set(
      attributes
        .filter((a) => a.name.toLowerCase() === "resource")
        .map((a) => a.value),
    ).size,
  };
}
const resolveUri = (uri, gateway) =>
  uri.startsWith("ipfs://")
    ? `${gateway.replace(/\/$/, "")}/${uri.slice(7).replace(/^ipfs\//, "")}`
    : uri;
export async function refreshMetadata(
  store,
  rpc,
  config,
  { assetDir, limit = 10 } = {},
) {
  // Expand collection/range refresh events incrementally, never as an unbounded write.
  const batches = store.db
    .prepare(
      "SELECT id,body FROM entities WHERE kind='metadata_job' AND json_extract(body,'$.state')='pending' AND id LIKE '%:*' LIMIT 1",
    )
    .all();
  for (const row of batches) {
    store.db.exec("BEGIN IMMEDIATE");
    try {
      const job = JSON.parse(row.body);
      const tokens = store.db
        .prepare(
          "SELECT id,body FROM entities WHERE kind='token' AND json_extract(body,'$.collection')=? AND num_key>=? AND num_key<=? AND (? IS NULL OR num_key>?) ORDER BY num_key LIMIT 100",
        )
        .all(
          job.collection,
          numericKey(job.fromTokenId ?? "0"),
          numericKey(job.toTokenId ?? MAX_U256),
          job.cursor ?? null,
          job.cursor ? numericKey(job.cursor) : null,
        );
      for (const token of tokens)
        store.put("metadata_job", token.id, {
          state: "pending",
          updatedAt: job.updatedAt,
        });
      store.put("metadata_job", row.id, {
        ...job,
        state: tokens.length === 100 ? "pending" : "complete",
        cursor: tokens.length
          ? JSON.parse(tokens.at(-1).body).tokenId
          : job.cursor,
      });
      store.db.exec("COMMIT");
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
  }
  const now = Date.now();
  const tokens = store.db
    .prepare(
      "SELECT t.body FROM entities t LEFT JOIN entities job ON job.kind='metadata_job' AND job.id=t.id WHERE t.kind='token' AND COALESCE(json_extract(t.body,'$.burned'),0)=0 AND COALESCE(json_extract(job.body,'$.leaseUntil'),0)<? AND (COALESCE(json_extract(t.body,'$.metadataNextAttempt'),0)<? OR json_extract(job.body,'$.state')='pending') ORDER BY COALESCE(json_extract(t.body,'$.metadataFetchedAt'),0) LIMIT ?",
    )
    .all(now, now, limit)
    .map((r) => JSON.parse(r.body));
  for (const token of tokens) {
    let patch;
    const generation = store.generation();
    store.db.exec("BEGIN IMMEDIATE");
    const job = store.get("metadata_job", token.id) ?? { attempts: 0 };
    if ((job.leaseUntil ?? 0) > now) {
      store.db.exec("ROLLBACK");
      continue;
    }
    const lease = randomUUID();
    store.put("metadata_job", token.id, {
      ...job,
      state: "running",
      lease,
      leaseUntil: now + 60000,
      attempts: (job.attempts ?? 0) + 1,
    });
    store.db.exec("COMMIT");
    try {
      let values;
      try {
        values = await rpc.contract(
          token.collection,
          SELECTORS.token_uri,
          u256Felts(token.tokenId),
        );
      } catch {
        values = await rpc.contract(
          token.collection,
          SELECTORS.tokenURI,
          u256Felts(token.tokenId),
        );
      }
      const uri = decodeUri(values);
      let bytes;
      if (uri.startsWith("data:application/json;base64,")) {
        if (uri.length > 2 * 1024 * 1024)
          throw new Error("Inline metadata too large");
        bytes = Buffer.from(uri.split(",")[1], "base64");
      } else if (uri.startsWith("data:application/json,"))
        bytes = Buffer.from(
          decodeURIComponent(uri.slice("data:application/json,".length)),
        );
      else
        bytes = (
          await fetchPublic(
            resolveUri(uri, config.ipfsGateway ?? "https://ipfs.io/ipfs"),
          )
        ).bytes;
      const raw = JSON.parse(bytes.toString()),
        metadata = normalizeMetadata(raw);
      let image = null;
      if (metadata.image && assetDir) {
        try {
          const asset = await fetchPublic(
            resolveUri(
              metadata.image,
              config.ipfsGateway ?? "https://ipfs.io/ipfs",
            ),
            { maxBytes: 10 * 1024 * 1024 },
          );
          const ext = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/svg+xml": "svg",
          }[asset.contentType];
          if (ext) {
            const name =
              createHash("sha256").update(asset.bytes).digest("hex") +
              "." +
              ext;
            await mkdir(assetDir, { recursive: true });
            await writeFile(join(assetDir, name), asset.bytes);
            image = `/api/marketplace/v1/chains/${config.chain}/assets/${name}`;
          }
        } catch {
          /* The metadata remains useful when its media is unavailable. */
        }
      }
      const attributes = metadata.attributes;
      patch = {
        metadata: {
          ...metadata,
          image,
          attributes: attributes.map((a) => ({
            trait_type: a.name,
            value: a.value,
          })),
        },
        attributes,
        resourceCount: metadata.resourceCount,
        image,
        metadataUri: uri,
        metadataHash: createHash("sha256").update(bytes).digest("hex"),
        metadataStatus: "ready",
        metadataError: null,
        metadataFetchedAt: now,
        metadataNextAttempt: now + 60000,
      };
    } catch (e) {
      patch = {
        metadataStatus: "failed",
        metadataError: e.message,
        metadataNextAttempt: now + 300000,
      };
    }
    store.db.exec("BEGIN IMMEDIATE");
    try {
      const current = store.get("token", token.id);
      if (
        store.generation() === generation &&
        current?.updatedAt?.blockHash === token.updatedAt?.blockHash &&
        store.get("metadata_job", token.id)?.lease === lease
      ) {
        store.put("token", token.id, { ...current, ...patch });
        store.put("metadata_job", token.id, {
          state: patch.metadataStatus === "ready" ? "complete" : "failed",
          attempts: (job.attempts ?? 0) + 1,
          leaseUntil: 0,
          nextAttempt: patch.metadataNextAttempt,
          error: patch.metadataError,
        });
      }
      store.db.exec("COMMIT");
    } catch (e) {
      store.db.exec("ROLLBACK");
      throw e;
    }
  }
  return tokens.length;
}
