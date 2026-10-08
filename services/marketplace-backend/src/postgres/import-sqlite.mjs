import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "./migrate.mjs";
import { PgStore, TABLES, METADATA_KEYS } from "./store.mjs";
import { numericKey, address } from "../domain.mjs";
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, sorted(value[k])]),
        )
      : value;
const hashRow = (hash, row) => hash.update(JSON.stringify(sorted(row)) + "\n");
function* mapRows(rows, mapper) {
  for (const row of rows) yield mapper(row);
}
const sum = (rows) => {
  const hash = createHash("sha256");
  let count = 0;
  for (const row of rows) {
    hashRow(hash, row);
    count++;
  }
  return { count, digest: hash.digest("hex") };
};
const appTables = {
  app_meta: ["key", "value"],
  challenges: ["id", "account", "message", "expires", "used"],
  sessions: ["token_hash", "account", "expires"],
  reports: ["id", "account", "body", "status", "created"],
  moderation: ["collection", "body"],
  audit: ["id", "actor", "action", "body", "created"],
};
const sourceTables = {
  blocks: ["number", "hash", "parent", "timestamp"],
  events: ["block_hash", "tx", "idx", "body"],
  undo: ["height", "kind", "id", "before"],
  meta: ["key", "value"],
};
const jsonColumns = new Set(["body", "before", "value", "message"]);
const normalizeRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      jsonColumns.has(key) && typeof value === "string"
        ? JSON.parse(value)
        : typeof value === "bigint"
          ? Number(value)
          : value,
    ]),
  );
function openSource({ chainPath, appPath }) {
  const chain = new DatabaseSync(chainPath, { readOnly: true }),
    app = new DatabaseSync(appPath ?? chainPath + ".app", { readOnly: true });
  try {
    for (const db of [chain, app]) {
      db.exec("PRAGMA query_only=ON; BEGIN");
      if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
        throw new Error("Source SQLite integrity check failed");
    }
    const check = (db, allowed) => {
      for (const { name } of db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all())
        if (!allowed.includes(name))
          throw new Error("Unsupported source table: " + name);
    };
    check(chain, ["entities", ...Object.keys(sourceTables)]);
    for (const { kind } of chain
      .prepare("SELECT DISTINCT kind FROM entities")
      .all())
      if (!Object.hasOwn(TABLES, kind))
        throw new Error("Unsupported source entity kind: " + kind);
    check(app, ["notifications", "sqlite_sequence", ...Object.keys(appTables)]);
    return {
      chain,
      app,
      close() {
        chain.exec("ROLLBACK");
        app.exec("ROLLBACK");
        chain.close();
        app.close();
      },
    };
  } catch (error) {
    chain.close();
    app.close();
    throw error;
  }
}
const sourceRows = (db, table, columns) =>
  db
    .prepare(
      `SELECT ${columns.join(",")} FROM ${table} ORDER BY ${columns.filter((c) => !jsonColumns.has(c)).join(",")}`,
    )
    .iterate();
function sourceManifest(source, assetDir) {
  const tables = {};
  for (const [name, columns] of Object.entries(sourceTables))
    tables["chain." + name] = sum(
      mapRows(sourceRows(source.chain, name, columns), normalizeRow),
    );
  for (const kind of Object.keys(TABLES))
    tables["entity." + kind] = sum(
      mapRows(
        source.chain
          .prepare(
            "SELECT id,body,num_key FROM entities WHERE kind=? ORDER BY id",
          )
          .iterate(kind),
        (row) => {
          const body = JSON.parse(row.body),
            value = body.buyerDebit ?? body.tokenId;
          if (
            value != null &&
            (!row.num_key ||
              !Buffer.from(row.num_key).equals(numericKey(value)))
          )
            throw new Error("Invalid numeric index in SQLite source");
          return { id: row.id, body };
        },
      ),
    );
  for (const [name, columns] of Object.entries(appTables))
    tables["app." + name] = sum(
      mapRows(sourceRows(source.app, name, columns), normalizeRow),
    );
  tables["app.notifications"] = sum(
    mapRows(
      sourceRows(source.app, "notifications", [
        "id",
        "account",
        "body",
        "height",
        "canonical",
        "is_read",
      ]),
      normalizeRow,
    ),
  );
  const assets = [];
  if (assetDir && existsSync(assetDir))
    for (const file of readdirSync(assetDir, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (
        !file.isFile() ||
        !/^[a-f0-9]{64}\.(png|jpg|gif|webp|svg)$/.test(file.name)
      )
        throw new Error("Unsupported source media file");
      const bytes = readFileSync(join(assetDir, file.name)),
        hash = createHash("sha256").update(bytes).digest("hex");
      if (bytes.length > 10485760 || hash !== file.name.slice(0, 64))
        throw new Error("Source media checksum mismatch");
      assets.push({ name: file.name, size: bytes.length, sha256: hash });
    }
  tables["media.assets"] = sum(assets);
  return tables;
}
let cursorCounter = 0;
async function queryDigest(client, sql, normalize = (row) => row) {
  const name = "migration_cursor_" + ++cursorCounter;
  await client.query(`DECLARE ${name} NO SCROLL CURSOR FOR ${sql}`);
  const hash = createHash("sha256");
  let count = 0;
  try {
    while (true) {
      const rows = (await client.query(`FETCH FORWARD 1000 FROM ${name}`)).rows;
      if (!rows.length) break;
      for (const row of rows) {
        hashRow(hash, normalize(row));
        count++;
      }
    }
  } finally {
    await client.query(`CLOSE ${name}`);
  }
  return { count, digest: hash.digest("hex") };
}
const numericColumns = new Set([
  "number",
  "timestamp",
  "height",
  "idx",
  "expires",
  "created",
  "id",
]);
function normalizePg(row, audit = false) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      numericColumns.has(key) &&
      typeof value === "string" &&
      (key !== "id" || audit)
        ? Number(value)
        : ["used", "canonical", "is_read"].includes(key) &&
            typeof value === "boolean"
          ? Number(value)
          : value,
    ]),
  );
}
const pgOrder = (columns, audit = false) =>
  columns
    .filter((c) => !jsonColumns.has(c))
    .map((c) =>
      (numericColumns.has(c) && (c !== "id" || audit)) ||
      ["used", "canonical", "is_read"].includes(c)
        ? c
        : `${c} COLLATE "C"`,
    )
    .join(",");
async function pgManifest(client, excludeIdentity = false) {
  const tables = {};
  for (const [name, columns] of Object.entries(sourceTables)) {
    const where =
      name === "meta"
        ? " WHERE key NOT LIKE 'migration_%'" +
          (excludeIdentity ? " AND key <> 'identity'" : "")
        : "";
    tables["chain." + name] = await queryDigest(
      client,
      `SELECT ${columns.join(",")} FROM chain.${name}${where} ORDER BY ${pgOrder(columns)}`,
      normalizePg,
    );
  }
  for (const [kind, table] of Object.entries(TABLES)) {
    const query =
      kind === "token"
        ? `SELECT t.id,t.body || COALESCE(m.body,'{}'::jsonb) AS body FROM market.tokens t LEFT JOIN market.token_metadata m ON m.id=t.id ORDER BY t.id COLLATE "C"`
        : `SELECT id,body FROM ${table} ORDER BY id COLLATE "C"`;
    tables["entity." + kind] = await queryDigest(client, query);
  }
  for (const [name, columns] of Object.entries(appTables))
    tables["app." + name] = await queryDigest(
      client,
      `SELECT ${columns.join(",")} FROM app.${name} ORDER BY ${pgOrder(columns, name === "audit")}`,
      (row) => normalizePg(row, name === "audit"),
    );
  tables["app.notifications"] = await queryDigest(
    client,
    'SELECT o.id,o.account,o.body,o.height,o.canonical,COALESCE(r.is_read,false) AS is_read FROM chain.notification_outbox o LEFT JOIN app.notification_reads r ON r.id=o.id AND r.account=o.account ORDER BY o.id COLLATE "C",o.account COLLATE "C",o.height,o.canonical,is_read',
    normalizePg,
  );
  tables["media.assets"] = await queryDigest(
    client,
    "SELECT name,octet_length(bytes) AS size,encode(sha256(bytes),'hex') AS sha256 FROM media.assets ORDER BY name COLLATE \"C\"",
  );
  return tables;
}
function compare(source, target) {
  for (const [name, expected] of Object.entries(source)) {
    const actual = target[name];
    if (actual?.count !== expected.count || actual?.digest !== expected.digest)
      throw new Error("Migration digest mismatch: " + name);
  }
  return true;
}
async function insertRows(client, table, columns, rows) {
  if (!rows.length) return;
  if (rows.length > 500) {
    for (let i = 0; i < rows.length; i += 500)
      await insertRows(client, table, columns, rows.slice(i, i + 500));
    return;
  }
  const values = [];
  const tuples = rows.map(
    (row) =>
      "(" +
      columns
        .map((key) => {
          const value = row[key];
          values.push(
            jsonColumns.has(key) && value !== null
              ? JSON.stringify(value)
              : value,
          );
          return "$" + values.length;
        })
        .join(",") +
      ")",
  );
  await client.query(
    `INSERT INTO ${table}(${columns.join(",")}) VALUES ${tuples.join(",")}`,
    values,
  );
}
async function copyRows(client, table, columns, rows) {
  let batch = [];
  for (const row of rows) {
    batch.push(normalizeRow(row));
    if (batch.length === 500) {
      await insertRows(client, table, columns, batch);
      batch = [];
    }
  }
  await insertRows(client, table, columns, batch);
}
function sourceIdentity(source, expected) {
  const observed = JSON.parse(
    source.chain.prepare("SELECT value FROM meta WHERE key='identity'").get()
      ?.value ?? "null",
  );
  const identity = expected ?? observed;
  if (!identity) throw new Error("An explicit registry identity is required");
  if (
    observed &&
    (observed.chainId !== identity.chainId ||
      observed.marketplace !== identity.marketplace)
  )
    throw new Error("Source deployment identity mismatch");
  if (
    !observed &&
    (source.chain.prepare("SELECT 1 FROM blocks LIMIT 1").get() ||
      source.chain.prepare("SELECT 1 FROM events LIMIT 1").get() ||
      source.chain
        .prepare(
          "SELECT 1 FROM entities WHERE kind IN ('token','order','activity','progress') LIMIT 1",
        )
        .get())
  )
    throw new Error(
      "An indexed source must already have a deployment identity",
    );
  return { observed, identity };
}
export async function importSqlite({
  pool,
  chainPath,
  appPath,
  assetDir,
  identity,
  sourceFrozen = false,
}) {
  if (!sourceFrozen)
    throw new Error(
      "Freeze the SQLite writers and application writes before importing their paired snapshots",
    );
  const source = openSource({ chainPath, appPath });
  let client;
  try {
    const manifest = sourceManifest(source, assetDir);
    const { observed } = sourceIdentity(source, identity);
    await migrate(pool);
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('biblio-projections'),1)",
    );
    for (const table of [
      ...Object.values(TABLES),
      "chain.blocks",
      "chain.events",
      "chain.undo",
      "chain.notification_outbox",
      ...Object.keys(appTables).map((t) => "app." + t),
      "app.notification_reads",
      "market.token_metadata",
      "market.attributes",
      "media.assets",
    ])
      if ((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)
        throw new Error("Target database must be empty before import");
    await client.query("DELETE FROM chain.meta");
    for (const [name, columns] of Object.entries(sourceTables))
      await copyRows(
        client,
        "chain." + name,
        columns,
        sourceRows(source.chain, name, columns),
      );
    for (const [kind, table] of Object.entries(TABLES)) {
      let batch = [],
        metadata = [],
        attributes = [];
      const flush = async () => {
        await insertRows(client, table, ["id", "body"], batch);
        await insertRows(
          client,
          "market.token_metadata",
          ["id", "body"],
          metadata,
        );
        if (attributes.length) {
          const seen = new Set();
          attributes = attributes.filter((a) => {
            const key = JSON.stringify([a.token_id, a.name, a.value]);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          await insertRows(
            client,
            "market.attributes",
            ["token_id", "name", "value", "numeric_value", "text_value"],
            attributes,
          );
        }
        batch = [];
        metadata = [];
        attributes = [];
      };
      for (const row of source.chain
        .prepare("SELECT id,body FROM entities WHERE kind=? ORDER BY id")
        .iterate(kind)) {
        const body = JSON.parse(row.body);
        if (kind === "token") {
          const patch = {};
          for (const key of METADATA_KEYS)
            if (Object.hasOwn(body, key)) {
              patch[key] = body[key];
              delete body[key];
            }
          if (Object.keys(patch).length)
            metadata.push({ id: row.id, body: patch });
          for (const attr of patch.attributes ?? [])
            attributes.push({
              token_id: row.id,
              name: attr.name,
              value: attr.value,
              numeric_value:
                typeof attr.value === "number" ? String(attr.value) : null,
              text_value: String(attr.value),
            });
        }
        batch.push({ id: row.id, body });
        if (batch.length === 100) await flush();
      }
      await flush();
    }
    for (const [name, columns] of Object.entries(appTables))
      await copyRows(
        client,
        "app." + name,
        columns,
        sourceRows(source.app, name, columns),
      );
    for (const row of source.app
      .prepare("SELECT * FROM notifications ORDER BY id,account")
      .iterate()) {
      await client.query(
        "INSERT INTO chain.notification_outbox VALUES($1,$2,$3,$4,$5)",
        [
          row.id,
          row.account,
          JSON.parse(row.body),
          row.height,
          !!row.canonical,
        ],
      );
      await client.query(
        "INSERT INTO app.notification_reads VALUES($1,$2,$3)",
        [row.id, row.account, !!row.is_read],
      );
    }
    await client.query(
      "SELECT setval(pg_get_serial_sequence('app.audit','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM app.audit",
    );
    if (assetDir && existsSync(assetDir))
      for (const name of readdirSync(assetDir).sort()) {
        const ext = name.split(".").at(-1),
          type = {
            png: "image/png",
            jpg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            svg: "image/svg+xml",
          }[ext];
        await client.query("INSERT INTO media.assets VALUES($1,$2,$3)", [
          name,
          type,
          readFileSync(join(assetDir, name)),
        ]);
      }
    if (!observed)
      await client.query("INSERT INTO chain.meta VALUES('identity',$1)", [
        identity,
      ]);
    compare(manifest, await pgManifest(client, !observed));
    const result = {
      verified: true,
      identity,
      identityObservedInSource: !!observed,
      tables: manifest,
      head:
        source.chain
          .prepare(
            "SELECT number,hash FROM blocks ORDER BY number DESC LIMIT 1",
          )
          .get() ?? null,
    };
    await client.query("INSERT INTO chain.meta VALUES('migration_source',$1)", [
      result,
    ]);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
    source.close();
  }
}
export async function verifySqliteImport({
  pool,
  chainPath,
  appPath,
  assetDir,
  identity,
}) {
  const source = openSource({ chainPath, appPath }),
    client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const manifest = sourceManifest(source, assetDir);
    const binding = sourceIdentity(source, identity);
    const actual = (
      await client.query("SELECT value FROM chain.meta WHERE key='identity'")
    ).rows[0]?.value;
    if (
      !actual ||
      actual.chainId !== binding.identity.chainId ||
      actual.marketplace !== binding.identity.marketplace
    )
      throw new Error("Target identity mismatch");
    compare(manifest, await pgManifest(client, !binding.observed));
    await client.query("COMMIT");
    return { verified: true, tables: manifest };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    source.close();
  }
}
export async function initializeRegistry(pool, config) {
  const store = new PgStore(pool);
  await store.bindIdentity({
    chainId: "0x" + BigInt(config.chainId).toString(16),
    marketplace: config.marketplace ? address(config.marketplace) : null,
  });
  for (const c of config.collections ?? [])
    await store.put("collection", address(c.address), {
      ...c,
      address: address(c.address),
      verified: false,
      ...(await store.get("collection", address(c.address))),
    });
}
