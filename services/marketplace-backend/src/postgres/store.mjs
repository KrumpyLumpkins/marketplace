import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { address, ApiError } from "../domain.mjs";
import { projectEvent, projectionReads } from "../projection.mjs";
export const TABLES = Object.freeze({
  collection: "market.collections",
  token: "market.tokens",
  order: "market.orders",
  activity: "market.activity",
  progress: "chain.progress",
  status: "chain.status",
  config: "market.configuration",
  policy: "market.policies",
  approval: "market.approvals",
  operator: "market.operator_approvals",
  metadata_job: "market.metadata_jobs",
  stats_day: "market.daily_stats",
  floor_current: "market.floor_current",
  floor_history: "market.floor_history",
});
export const METADATA_KEYS = [
  "metadata",
  "attributes",
  "resourceCount",
  "image",
  "metadataUri",
  "metadataHash",
  "metadataStatus",
  "metadataError",
  "metadataFetchedAt",
  "metadataNextAttempt",
];
const table = (kind) => {
  if (!Object.hasOwn(TABLES, kind))
    throw new ApiError("UNKNOWN_ENTITY", "Unsupported entity kind");
  return TABLES[kind];
};
const safeNumber = (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Database position exceeds safe integer range");
  return number;
};
export class PgStore {
  constructor(pool, { client, ownsPool = false } = {}) {
    this.pool = pool;
    this.client = client;
    this.ownsPool = ownsPool;
    this.context = new AsyncLocalStorage();
    this.dialect = "postgres";
  }
  query(sql, params = []) {
    return (this.context.getStore()?.client ?? this.client ?? this.pool).query(
      sql,
      params,
    );
  }
  assertWriterLease() {
    if (this.lease?.lost)
      throw new ApiError("INDEXER_LEASE_LOST", "Scanner lost its writer lease");
  }
  async transaction(work) {
    this.assertWriterLease();
    if (this.context.getStore()) return work();
    if (this.client) throw new Error("Cannot write using a read snapshot");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('biblio-projections'),1)",
      );
      const result = await this.context.run({ client }, work);
      this.assertWriterLease();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async beginSnapshot() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return new PgStore(this.pool, { client });
    } catch (error) {
      client.release();
      throw error;
    }
  }
  async endSnapshot() {
    if (this.client) {
      const client = this.client;
      this.client = null;
      try {
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    }
  }
  async acquireIndexerLease() {
    if (this.lease) throw new Error("Scanner lease already acquired");
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT pg_try_advisory_lock(hashtext('biblio-indexer'),1) AS acquired",
      );
      if (!rows[0].acquired)
        throw new Error("Another scanner holds the writer lease");
    } catch (error) {
      client.release();
      throw error;
    }
    const lease = { client, lost: false };
    this.lease = lease;
    const onError = () => {
      lease.lost = true;
    };
    client.on("error", onError);
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      this.lease = null;
      try {
        if (!lease.lost)
          await client.query(
            "SELECT pg_advisory_unlock(hashtext('biblio-indexer'),1)",
          );
      } finally {
        client.removeListener("error", onError);
        client.release(lease.lost);
      }
    };
  }
  async bindIdentity(identity) {
    return this.transaction(async () => {
      const old = (
        await this.query("SELECT value FROM chain.meta WHERE key='identity'")
      ).rows[0]?.value;
      if (old && JSON.stringify(old) !== JSON.stringify(identity)) {
        if (
          old.chainId !== identity.chainId ||
          old.marketplace !== identity.marketplace
        )
          throw new ApiError(
            "DATABASE_IDENTITY_MISMATCH",
            "Database identity belongs to another chain/deployment",
          );
      }
      await this.query(
        "INSERT INTO chain.meta(key,value) VALUES('identity',$1) ON CONFLICT(key) DO NOTHING",
        [identity],
      );
    });
  }
  async get(kind, id) {
    const row = (
      await this.query(`SELECT body FROM ${table(kind)} WHERE id=$1`, [id])
    ).rows[0];
    if (!row) return null;
    if (kind === "token") {
      const metadata = (
        await this.query("SELECT body FROM market.token_metadata WHERE id=$1", [
          id,
        ])
      ).rows[0]?.body;
      return { metadata: {}, attributes: [], ...row.body, ...metadata };
    }
    return row.body;
  }
  async list(kind) {
    const rows = (
      await this.query(`SELECT id,body FROM ${table(kind)} ORDER BY id`)
    ).rows;
    if (kind === "token") {
      const metadata = new Map(
        (
          await this.query("SELECT id,body FROM market.token_metadata")
        ).rows.map((r) => [r.id, r.body]),
      );
      return rows.map((r) => ({
        metadata: {},
        attributes: [],
        ...r.body,
        ...metadata.get(r.id),
      }));
    }
    return rows.map((r) => r.body);
  }
  async put(kind, id, body, height) {
    if (!this.context.getStore())
      return this.transaction(() => this.put(kind, id, body, height));
    const name = table(kind);
    let value = { ...body };
    if (kind === "token") for (const key of METADATA_KEYS) delete value[key];
    if (height !== undefined) {
      const before =
        (await this.query(`SELECT body FROM ${name} WHERE id=$1`, [id])).rows[0]
          ?.body ?? null;
      await this.query(
        "INSERT INTO chain.undo(height,kind,id,before) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [height, kind, id, before],
      );
    }
    await this.query(
      `INSERT INTO ${name}(id,body) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET body=excluded.body`,
      [id, value],
    );
  }
  async head() {
    const row = (
      await this.query(
        'SELECT number,hash,parent AS "parentHash",timestamp FROM chain.blocks ORDER BY number DESC LIMIT 1',
      )
    ).rows[0];
    return row
      ? {
          ...row,
          number: safeNumber(row.number),
          timestamp: safeNumber(row.timestamp),
        }
      : null;
  }
  async generation() {
    return safeNumber(
      (await this.query("SELECT value FROM chain.meta WHERE key='generation'"))
        .rows[0].value,
    );
  }
  async canonicalBlock(number) {
    return (
      (
        await this.query("SELECT hash FROM chain.blocks WHERE number=$1", [
          number,
        ])
      ).rows[0] ?? null
    );
  }
  async applyBlock(block) {
    return this.transaction(async () => {
      if (this.lease?.lost)
        throw new ApiError(
          "INDEXER_LEASE_LOST",
          "Scanner lost its writer lease",
        );
      const existing = await this.canonicalBlock(block.number);
      if (existing) {
        if (existing.hash === block.hash) return;
        throw new ApiError(
          "CHAIN_CONFLICT",
          "Conflicting canonical block",
          409,
        );
      }
      const head = await this.head();
      if (
        head &&
        (block.number !== head.number + 1 || block.parentHash !== head.hash)
      )
        throw new ApiError(
          "CHAIN_GAP",
          "Block does not extend indexed head",
          409,
        );
      await this.query("INSERT INTO chain.blocks VALUES($1,$2,$3,$4)", [
        block.number,
        block.hash,
        block.parentHash,
        block.timestamp,
      ]);
      const seen = new Set();
      for (const [i, event] of block.events.entries()) {
        const tx = event.transactionHash ?? `fixture:${block.hash}`,
          idx = event.eventIndex ?? i,
          key = `${tx}:${idx}`;
        if (seen.has(key))
          throw new ApiError(
            "DUPLICATE_EVENT",
            "Duplicate receipt event index",
          );
        seen.add(key);
        await this.query(
          "INSERT INTO chain.events VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [block.hash, tx, idx, event],
        );
        await this.project(event, {
          blockNumber: block.number,
          blockHash: block.hash,
          transactionHash: tx,
          eventIndex: idx,
          timestamp: block.timestamp,
        });
      }
      await this.recordFloors(block);
      for (const source of block.sources ?? []) {
        const old = await this.get("progress", source);
        await this.put(
          "progress",
          source,
          {
            source,
            startBlock: old?.startBlock ?? block.sourceStarts?.[source] ?? null,
            block: block.number,
            hash: block.hash,
            observedAt: block.observedAt ?? Date.now(),
          },
          block.number,
        );
      }
    });
  }
  async project(e, p) {
    const reads = new Map();
    for (const [kind, id] of projectionReads(e, p))
      reads.set(`${kind}:${id}`, await this.get(kind, id));
    const writes = [];
    projectEvent(
      e,
      p,
      (kind, id) => {
        const key = `${kind}:${id}`;
        if (!reads.has(key))
          throw new Error("Projection read not declared: " + key);
        return reads.get(key);
      },
      (...args) => writes.push(args),
    );
    for (const args of writes) await this.put(...args);
    const activity = writes.find(([kind]) => kind === "activity")?.[2];
    for (const account of new Set(activity?.notificationRecipients ?? []))
      await this.query(
        "INSERT INTO chain.notification_outbox(id,account,body,height,canonical) VALUES($1,$2,$3,$4,true) ON CONFLICT(id,account) DO UPDATE SET canonical=true",
        [activity.id, account, activity, p.blockNumber],
      );
  }
  async recordFloors(block) {
    const pairs = (
      await this.query(
        "SELECT DISTINCT collection,currency FROM market.orders WHERE kind='listing'",
      )
    ).rows;
    for (const pair of pairs) {
      const row = (
        await this.query(
          "SELECT o.buyer_debit::text AS price FROM market.orders o JOIN market.tokens t ON t.collection=o.collection AND t.token_id=o.token_id AND t.owner=o.maker WHERE o.kind='listing' AND o.state='open' AND o.collection=$1 AND o.currency=$2 AND o.expiry>$3 ORDER BY o.buyer_debit LIMIT 1",
          [pair.collection, pair.currency, block.timestamp],
        )
      ).rows[0];
      const price = row?.price ?? null,
        key = `${pair.collection}:${pair.currency}`,
        prior = await this.get("floor_current", key);
      if (!prior || prior.price !== price) {
        const point = {
          ...pair,
          price,
          timestamp: block.timestamp,
          block: block.number,
        };
        await this.put("floor_current", key, point, block.number);
        await this.put(
          "floor_history",
          `${key}:${block.number}`,
          point,
          block.number,
        );
      }
    }
  }
  async rewind(height) {
    return this.transaction(async () => {
      const rows = (
        await this.query(
          "SELECT height,kind,id,before FROM chain.undo WHERE height>$1 ORDER BY height DESC,kind,id",
          [height],
        )
      ).rows;
      for (const row of rows) {
        if (row.before) await this.put(row.kind, row.id, row.before);
        else
          await this.query(`DELETE FROM ${table(row.kind)} WHERE id=$1`, [
            row.id,
          ]);
      }
      await this.query("DELETE FROM chain.undo WHERE height>$1", [height]);
      await this.query("DELETE FROM chain.blocks WHERE number>$1", [height]);
      await this.query(
        "UPDATE chain.meta SET value=to_jsonb((value::text)::bigint+1) WHERE key='generation'",
      );
      await this.query(
        "UPDATE chain.notification_outbox SET canonical=false WHERE height>$1",
        [height],
      );
      // Metadata is rebuildable. In-flight results from the former generation cannot apply.
      await this.query("DELETE FROM market.token_metadata");
      await this.query("DELETE FROM market.attributes");
    });
  }
  async reconcileNotifications() {
    /* Outbox entries commit atomically with each canonical block. */
  }
  async notifications(account) {
    return (
      await this.query(
        "SELECT o.body,o.canonical,COALESCE(r.is_read,false) AS is_read FROM chain.notification_outbox o LEFT JOIN app.notification_reads r ON r.id=o.id AND r.account=o.account WHERE o.account=$1 ORDER BY o.height DESC,o.id LIMIT 100",
        [address(account)],
      )
    ).rows.map((r) => ({ ...r.body, canonical: r.canonical, read: r.is_read }));
  }
  async putMetadata(id, patch) {
    if (!this.context.getStore())
      return this.transaction(() => this.putMetadata(id, patch));
    if (Object.keys(patch).some((key) => !METADATA_KEYS.includes(key)))
      throw new Error("Metadata cannot overwrite chain fields");
    await this.query(
      "INSERT INTO market.token_metadata(id,body) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET body=market.token_metadata.body || excluded.body",
      [id, patch],
    );
    if (Array.isArray(patch.attributes)) {
      await this.query("DELETE FROM market.attributes WHERE token_id=$1", [id]);
      for (const attr of patch.attributes)
        await this.query(
          "INSERT INTO market.attributes(token_id,name,value,numeric_value,text_value) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [
            id,
            attr.name,
            JSON.stringify(attr.value),
            typeof attr.value === "number" && Number.isFinite(attr.value)
              ? String(attr.value)
              : null,
            String(attr.value),
          ],
        );
    }
  }
  async transactionStatus(hash) {
    const event = (
      await this.query(
        "SELECT body FROM market.activity WHERE transaction_hash=$1 AND type=ANY($2::text[]) LIMIT 1",
        [
          hash,
          [
            "order_created",
            "order_filled",
            "order_cancelled",
            "initialized",
            "trading_changed",
            "fee_policy_changed",
            "collection_policy",
            "currency_policy",
            "admin_proposed",
            "admin_transferred",
          ],
        ],
      )
    ).rows[0]?.body;
    const canonical = event
      ? await this.canonicalBlock(event.provenance.blockNumber)
      : null;
    return {
      reflected:
        !!canonical &&
        BigInt(canonical.hash) === BigInt(event.provenance.blockHash),
      block: event?.provenance.blockNumber ?? null,
    };
  }
  async saveAsset(name, contentType, bytes) {
    if (
      !/^[a-f0-9]{64}\.(png|jpg|gif|webp|svg)$/.test(name) ||
      bytes.length > 10 * 1024 * 1024 ||
      createHash("sha256").update(bytes).digest("hex") !== name.slice(0, 64)
    )
      throw new Error("Invalid content-addressed asset");
    await this.query(
      "INSERT INTO media.assets(name,content_type,bytes) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [name, contentType, bytes],
    );
  }
  async asset(name) {
    return (
      (await this.query("SELECT bytes FROM media.assets WHERE name=$1", [name]))
        .rows[0]?.bytes ?? null
    );
  }
  async close() {
    if (this.ownsPool) await this.pool.end();
  }
}
