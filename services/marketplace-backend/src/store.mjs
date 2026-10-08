import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { address, uint, numericKey, ApiError } from "./domain.mjs";

/** Single chain writer; the journal, before-images and progress commit together. */
export class Store {
  constructor(
    path,
    appPath = path === ":memory:" ? ":memory:" : `${path}.app`,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.app = new DatabaseSync(appPath);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,num_key BLOB,PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS entity_collection ON entities(kind,json_extract(body,'$.collection'));
      CREATE INDEX IF NOT EXISTS entity_owner ON entities(kind,json_extract(body,'$.owner'));
      CREATE INDEX IF NOT EXISTS entity_maker ON entities(kind,json_extract(body,'$.maker'));
      CREATE INDEX IF NOT EXISTS entity_activity_height ON entities(kind,json_extract(body,'$.provenance.blockNumber'));
      CREATE INDEX IF NOT EXISTS entity_price ON entities(kind,json_extract(body,'$.currency'),num_key);
      CREATE INDEX IF NOT EXISTS order_token_currency ON entities(kind,json_extract(body,'$.kind'),json_extract(body,'$.collection'),json_extract(body,'$.tokenId'),json_extract(body,'$.currency'),num_key,id);
      CREATE INDEX IF NOT EXISTS token_collection_identity ON entities(kind,json_extract(body,'$.collection'),json_extract(body,'$.tokenId'),json_extract(body,'$.owner'));
      CREATE INDEX IF NOT EXISTS activity_transaction ON entities(kind,json_extract(body,'$.provenance.transactionHash'));
      CREATE TABLE IF NOT EXISTS blocks(number INTEGER PRIMARY KEY,hash TEXT UNIQUE NOT NULL,parent TEXT NOT NULL,timestamp INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(block_hash TEXT NOT NULL,tx TEXT NOT NULL,idx INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(block_hash,tx,idx));
      CREATE TABLE IF NOT EXISTS undo(height INTEGER NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,before TEXT,PRIMARY KEY(height,kind,id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES('generation','1');`);
    this.app.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS notifications(id TEXT NOT NULL,account TEXT NOT NULL,body TEXT NOT NULL,height INTEGER NOT NULL,canonical INTEGER NOT NULL DEFAULT 1,is_read INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(id,account));
      CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,account TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,account TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS moderation(collection TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL);`);
  }
  get(kind, id) {
    const row = this.db
      .prepare("SELECT body FROM entities WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? JSON.parse(row.body) : null;
  }
  list(kind) {
    return this.db
      .prepare("SELECT body FROM entities WHERE kind=? ORDER BY id")
      .all(kind)
      .map((x) => JSON.parse(x.body));
  }
  put(kind, id, body, height) {
    if (height !== undefined) {
      const previous = this.db
        .prepare("SELECT body FROM entities WHERE kind=? AND id=?")
        .get(kind, id);
      this.db
        .prepare("INSERT OR IGNORE INTO undo VALUES(?,?,?,?)")
        .run(height, kind, id, previous?.body ?? null);
    }
    this.db
      .prepare(
        "INSERT INTO entities VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,num_key=excluded.num_key",
      )
      .run(
        kind,
        id,
        JSON.stringify(body),
        body.buyerDebit
          ? numericKey(body.buyerDebit)
          : body.tokenId != null
            ? numericKey(body.tokenId)
            : null,
      );
  }
  head() {
    return (
      this.db
        .prepare(
          "SELECT number,hash,parent AS parentHash,timestamp FROM blocks ORDER BY number DESC LIMIT 1",
        )
        .get() ?? null
    );
  }
  generation() {
    return Number(
      this.db.prepare("SELECT value FROM meta WHERE key='generation'").get()
        .value,
    );
  }
  snapshot(fn) {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  applyBlock(block) {
    const existing = this.db
      .prepare("SELECT hash FROM blocks WHERE number=?")
      .get(block.number);
    if (existing) {
      if (existing.hash === block.hash) return;
      throw new ApiError("CHAIN_CONFLICT", "Conflicting canonical block.", 409);
    }
    const head = this.head();
    if (
      head &&
      (block.number !== head.number + 1 || block.parentHash !== head.hash)
    )
      throw new ApiError(
        "CHAIN_GAP",
        "Block does not extend indexed head.",
        409,
      );
    const seen = new Set();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO blocks VALUES(?,?,?,?)")
        .run(block.number, block.hash, block.parentHash, block.timestamp);
      for (const [i, event] of block.events.entries()) {
        const tx = event.transactionHash ?? `fixture:${block.hash}`,
          idx = event.eventIndex ?? i;
        const identity = `${tx}:${idx}`;
        if (seen.has(identity))
          throw new ApiError(
            "DUPLICATE_EVENT",
            "Duplicate receipt event index.",
          );
        seen.add(identity);
        this.db
          .prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?)")
          .run(block.hash, tx, idx, JSON.stringify(event));
        const provenance = {
          blockNumber: block.number,
          blockHash: block.hash,
          transactionHash: tx,
          eventIndex: idx,
          timestamp: block.timestamp,
        };
        this.project(event, provenance);
      }
      this.recordFloors(block);
      for (const source of block.sources ?? [])
        this.put(
          "progress",
          source,
          {
            source,
            startBlock: this.get("progress", source)?.startBlock ?? block.sourceStarts?.[source] ?? null,
            block: block.number,
            hash: block.hash,
            observedAt: block.observedAt ?? Date.now(),
          },
          block.number,
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    // Durable application state has an idempotent outbox derived from canonical activity.
    this.reconcileNotifications();
  }
  recordFloors(block) {
    const pairs = this.db
      .prepare(
        "SELECT DISTINCT json_extract(body,'$.collection') AS collection,json_extract(body,'$.currency') AS currency FROM entities WHERE kind='order' AND json_extract(body,'$.kind')='listing'",
      )
      .all();
    const floor = this.db.prepare(
      `SELECT o.body FROM entities o JOIN entities t ON t.kind='token' AND json_extract(t.body,'$.collection')=json_extract(o.body,'$.collection') AND json_extract(t.body,'$.tokenId')=json_extract(o.body,'$.tokenId') AND json_extract(t.body,'$.owner')=json_extract(o.body,'$.maker') WHERE o.kind='order' AND json_extract(o.body,'$.kind')='listing' AND json_extract(o.body,'$.state')='open' AND json_extract(o.body,'$.collection')=? AND json_extract(o.body,'$.currency')=? AND CAST(json_extract(o.body,'$.expiry') AS INTEGER)>? ORDER BY o.num_key LIMIT 1`,
    );
    for (const pair of pairs) {
      const row = floor.get(pair.collection, pair.currency, block.timestamp),
        price = row ? JSON.parse(row.body).buyerDebit : null,
        key = `${pair.collection}:${pair.currency}`;
      const prior = this.get("floor_current", key);
      if (!prior || prior.price !== price) {
        const point = {
          ...pair,
          price,
          timestamp: block.timestamp,
          block: block.number,
        };
        this.put("floor_current", key, point, block.number);
        this.put(
          "floor_history",
          `${key}:${block.number}`,
          point,
          block.number,
        );
      }
    }
  }
  project(e, p) {
    const height = p.blockNumber;
    if (e.type === "transfer") {
      const id = `${address(e.collection)}:${uint(e.tokenId)}`,
        old = this.get("token", id);
      this.put(
        "token",
        id,
        {
          ...old,
          id,
          collection: address(e.collection),
          tokenId: uint(e.tokenId),
          owner: address(e.to),
          burned: BigInt(e.to) === 0n,
          attributes: old?.attributes ?? [],
          metadata: old?.metadata ?? {},
          firstSeenBlock: old?.firstSeenBlock ?? height,
          updatedAt: p,
        },
        height,
      );
      this.put("approval", id, { spender: address("0x0") }, height);
    } else if (e.type === "approval") {
      this.put(
        "approval",
        `${address(e.collection)}:${uint(e.tokenId)}`,
        { spender: address(e.spender) },
        height,
      );
    } else if (e.type === "operator_approval") {
      this.put(
        "operator",
        `${address(e.collection)}:${address(e.owner)}:${address(e.operator)}`,
        { approved: e.approved },
        height,
      );
    } else if (e.type === "order_created") {
      if (this.get("order", e.key))
        throw new ApiError("DUPLICATE_ORDER", "Maker nonce reused.");
      this.put(
        "order",
        e.key,
        { ...e, id: e.key, state: "open", createdAt: p, updatedAt: p },
        height,
      );
    } else if (e.type === "order_cancelled" || e.type === "order_filled") {
      const order = this.get("order", e.key);
      if (!order || order.state !== "open")
        throw new ApiError(
          "MISSING_ORDER",
          "Terminal event without an open order.",
        );
      this.put(
        "order",
        e.key,
        {
          ...order,
          state: e.type === "order_filled" ? "filled" : "cancelled",
          updatedAt: p,
          settlement: e.type === "order_filled" ? e : null,
        },
        height,
      );
    } else if (e.type === "initialized") {
      this.put("config", "marketplace", { ...e, updatedAt: p }, height);
    } else if (e.type === "fee_policy_changed") {
      const cfg = this.get("config", "marketplace");
      if (!cfg) throw new ApiError("MISSING_CONFIG", "Missing initialization.");
      this.put(
        "config",
        "marketplace",
        { ...cfg, feeBps: e.feeBps, feeRecipient: e.feeRecipient, updatedAt: p },
        height,
      );
    } else if (e.type === "trading_changed") {
      const cfg = this.get("config", "marketplace");
      if (!cfg) throw new ApiError("MISSING_CONFIG", "Missing initialization.");
      this.put(
        "config",
        "marketplace",
        { ...cfg, paused: e.paused, updatedAt: p },
        height,
      );
    } else if (e.type === "collection_policy" || e.type === "currency_policy") {
      this.put(
        "policy",
        `${e.type}:${address(e.address)}`,
        { ...e, updatedAt: p },
        height,
      );
    } else if (e.type === "admin_transferred") {
      const cfg = this.get("config", "marketplace");
      if (!cfg) throw new ApiError("MISSING_CONFIG", "Missing initialization.");
      this.put(
        "config",
        "marketplace",
        { ...cfg, admin: e.admin, updatedAt: p },
        height,
      );
      this.put(
        "config",
        "pending_admin",
        { admin: address("0"), updatedAt: p },
        height,
      );
    } else if (e.type === "admin_proposed") {
      this.put(
        "config",
        "pending_admin",
        { admin: e.admin, updatedAt: p },
        height,
      );
    } else if (e.type === "metadata_update") {
      this.put(
        "metadata_job",
        `${e.collection}:${e.tokenId ?? "*"}`,
        { ...e, state: "pending", updatedAt: p },
        height,
      );
    } else throw new ApiError("UNKNOWN_EVENT", `Unsupported event: ${e.type}`);
    const id = `${p.blockHash}:${p.transactionHash}:${p.eventIndex}`;
    if (e.type === "order_filled") {
      const day = Math.floor(p.timestamp / 86400) * 86400,
        key = `${e.collection}:${e.currency}:${day}`,
        previous = this.get("stats_day", key);
      this.put(
        "stats_day",
        key,
        {
          collection: e.collection,
          currency: e.currency,
          day,
          volume: (
            BigInt(previous?.volume ?? "0") + BigInt(e.buyerDebit)
          ).toString(),
          sales: (previous?.sales ?? 0) + 1,
        },
        height,
      );
    }
    const notificationRecipients =
      e.type === "order_filled"
        ? [e.buyer, e.seller]
        : e.type === "order_created" && e.kind === "token_offer"
          ? [this.get("token", `${e.collection}:${e.tokenId}`)?.owner]
          : e.type === "order_cancelled"
            ? [e.maker]
            : [];
    this.put(
      "activity",
      id,
      {
        ...e,
        id,
        provenance: p,
        notificationRecipients: notificationRecipients.filter(Boolean),
      },
      height,
    );
  }
  rewind(height) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changes = this.db
        .prepare("SELECT * FROM undo WHERE height>? ORDER BY height DESC")
        .all(height);
      for (const r of changes) {
        if (r.before) this.put(r.kind, r.id, JSON.parse(r.before));
        else
          this.db
            .prepare("DELETE FROM entities WHERE kind=? AND id=?")
            .run(r.kind, r.id);
      }
      this.db.prepare("DELETE FROM undo WHERE height>?").run(height);
      this.db.prepare("DELETE FROM blocks WHERE number>?").run(height);
      this.db
        .prepare(
          "UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='generation'",
        )
        .run();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    this.reconcileNotifications();
  }
  reconcileNotifications() {
    const head = this.head();
    const saved = this.app
      .prepare("SELECT value FROM app_meta WHERE key='notifications_head'")
      .get();
    const cursor = saved ? JSON.parse(saved.value) : null;
    const canonical = cursor
      ? this.db
          .prepare("SELECT hash FROM blocks WHERE number=?")
          .get(cursor.number)
      : null;
    const incremental = cursor && canonical?.hash === cursor.hash;
    const after = incremental ? cursor.number : -1;
    if (incremental && head?.number === after) return;
    this.app.exec("BEGIN IMMEDIATE");
    try {
      if (!incremental) this.app.exec("UPDATE notifications SET canonical=0");
      const activity = this.db
        .prepare(
          "SELECT body FROM entities WHERE kind='activity' AND json_extract(body,'$.provenance.blockNumber')>? ORDER BY json_extract(body,'$.provenance.blockNumber'),id",
        )
        .all(after);
      for (const row of activity) {
        const a = JSON.parse(row.body);
        for (const account of new Set(a.notificationRecipients ?? []))
          this.app
            .prepare(
              "INSERT INTO notifications(id,account,body,height,canonical) VALUES(?,?,?,?,1) ON CONFLICT(id,account) DO UPDATE SET canonical=1",
            )
            .run(a.id, account, JSON.stringify(a), a.provenance.blockNumber);
      }
      this.app
        .prepare(
          "INSERT OR REPLACE INTO app_meta VALUES('notifications_head',?)",
        )
        .run(JSON.stringify(head));
      this.app.exec("COMMIT");
    } catch (e) {
      this.app.exec("ROLLBACK");
      throw e;
    }
  }
  notifications(account) {
    return this.app
      .prepare(
        "SELECT * FROM notifications WHERE account=? ORDER BY height DESC LIMIT 100",
      )
      .all(address(account))
      .map((r) => ({
        ...JSON.parse(r.body),
        read: !!r.is_read,
        canonical: !!r.canonical,
      }));
  }
  async backup(path) {
    await backup(this.db, path);
    await backup(this.app, `${path}.app`);
  }
  close() {
    this.db.close();
    this.app.close();
  }
}
