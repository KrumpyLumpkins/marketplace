import { PgStore } from "./store.mjs";
const replacement = [
  "chain.meta",
  "chain.blocks",
  "chain.events",
  "chain.undo",
  "chain.progress",
  "chain.status",
  "chain.history_ranges",
  "chain.notification_outbox",
  "market.collections",
  "market.tokens",
  "market.orders",
  "market.activity",
  "market.configuration",
  "market.policies",
  "market.approvals",
  "market.operator_approvals",
  "market.daily_stats",
  "market.floor_current",
  "market.floor_history",
];
const retained = [
  "market.metadata_jobs",
  "market.token_metadata",
  "market.attributes",
  "media.assets",
];
/** Atomically replace rebuildable projections. Application tables are never touched.
 * Both scanners must be stopped: leases are acquired on both databases. The source
 * must have independently reconciled history and contain the target's checkpoint.
 */
export async function cutoverCollections(
  sourcePool,
  targetPool,
  { expectedSourceHash } = {},
) {
  const sourceStore = new PgStore(sourcePool),
    targetStore = new PgStore(targetPool);
  let sourceLease, targetLease, source, target;
  try {
    sourceLease = await sourceStore.acquireIndexerLease();
    targetLease = await targetStore.acquireIndexerLease();
    source = await sourcePool.connect();
    target = await targetPool.connect();
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await target.query("BEGIN");
    await target.query(
      "SELECT pg_advisory_xact_lock(hashtext('biblio-projections'), 1)",
    );
    const head = (
      await source.query(
        "SELECT number,hash FROM chain.blocks ORDER BY number DESC LIMIT 1",
      )
    ).rows[0];
    const prior = (
      await target.query(
        "SELECT number,hash FROM chain.blocks ORDER BY number DESC LIMIT 1",
      )
    ).rows[0];
    if (!head || head.hash !== expectedSourceHash)
      throw new Error(
        "Shadow checkpoint differs from reviewed cutover checkpoint",
      );
    const history = (
      await source.query("SELECT body FROM chain.status WHERE id='history'")
    ).rows[0]?.body;
    if (history?.state !== "passed")
      throw new Error("Shadow history reconciliation has not passed");
    const identity = async (c) =>
      (await c.query("SELECT value FROM chain.meta WHERE key='identity'"))
        .rows[0]?.value;
    const sourceIdentity = await identity(source),
      targetIdentity = await identity(target);
    if (
      !sourceIdentity?.chainId ||
      !sourceIdentity.marketplace ||
      !targetIdentity?.chainId ||
      !targetIdentity.marketplace ||
      JSON.stringify(sourceIdentity) !== JSON.stringify(targetIdentity)
    )
      throw new Error("Deployment identity mismatch");
    const collections = (
      await source.query("SELECT id FROM market.collections")
    ).rows;
    if (
      !collections.length ||
      collections.some(
        (c) =>
          !history.completedCollections?.some(
            (p) =>
              p.address === c.id &&
              String(p.supply) === String(p.checkedTokens),
          ),
      )
    )
      throw new Error("Missing per-collection reconciliation evidence");
    if (prior) {
      const matching = (
        await source.query("SELECT hash FROM chain.blocks WHERE number=$1", [
          prior.number,
        ])
      ).rows[0];
      if (matching?.hash !== prior.hash)
        throw new Error("Shadow does not contain the live checkpoint");
    }
    const progress = (await source.query("SELECT body FROM chain.progress"))
      .rows;
    if (
      !progress.length ||
      progress.some(
        ({ body }) =>
          String(body.block) !== String(head.number) || body.hash !== head.hash,
      )
    )
      throw new Error("Incomplete source progress");
    const generation =
      BigInt(
        (
          await target.query(
            "SELECT value FROM chain.meta WHERE key='generation'",
          )
        ).rows[0].value,
      ) + 1n;
    await target.query(
      `LOCK TABLE ${[...replacement, ...retained].join(",")} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const retainedMeta = (
      await target.query(
        "SELECT key,value FROM chain.meta WHERE key NOT IN ('identity','generation')",
      )
    ).rows;
    // DELETE preserves MVCC for API snapshots begun before the cutover.
    await target.query("DELETE FROM chain.history_ranges");
    for (const table of replacement) await target.query(`DELETE FROM ${table}`);
    const counts = {};
    for (const table of [...replacement, ...retained]) {
      const [schema, name] = table.split(".");
      const cols = (
        await source.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND is_generated='NEVER' ORDER BY ordinal_position",
          [schema, name],
        )
      ).rows.map((r) => r.column_name);
      if (!cols.length) throw new Error("Missing expected table " + table);
      const quoted = cols.map((c) => '"' + c + '"').join(",");
      const selection = cols
        .map((c) =>
          c === "bytes" ? "'\\x'||encode(bytes,'hex') AS bytes" : '"' + c + '"',
        )
        .join(",");
      const existingAssets =
        table === "media.assets"
          ? (await target.query("SELECT name FROM media.assets")).rows.map(
              (r) => r.name,
            )
          : null;
      await source.query(
        `DECLARE onboard_rows NO SCROLL CURSOR FOR SELECT ${selection} FROM ${table}${existingAssets ? " WHERE NOT(name=ANY($1::text[]))" : ""}`,
        existingAssets ? [existingAssets] : [],
      );
      let copied = 0;
      while (true) {
        const { rows } = await source.query(
          table === "media.assets"
            ? "FETCH 1 FROM onboard_rows"
            : "FETCH 100 FROM onboard_rows",
        );
        if (!rows.length) break;
        await target.query(
          `INSERT INTO ${table} (${quoted}) SELECT ${quoted} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb) ${retained.includes(table) ? "ON CONFLICT DO NOTHING" : ""}`,
          [JSON.stringify(rows)],
        );
        copied += rows.length;
      }
      await source.query("CLOSE onboard_rows");
      counts[table] = copied;
    }
    await target.query(
      "UPDATE chain.meta SET value=$1::jsonb WHERE key='generation'",
      [generation.toString()],
    );
    for (const row of retainedMeta)
      await target.query(
        "INSERT INTO chain.meta VALUES($1,$2) ON CONFLICT DO NOTHING",
        [row.key, row.value],
      );
    await target.query("COMMIT");
    await source.query("COMMIT");
    return {
      head,
      previousHead: prior,
      generation: generation.toString(),
      counts,
    };
  } catch (e) {
    await target?.query("ROLLBACK");
    await source?.query("ROLLBACK");
    throw e;
  } finally {
    source?.release();
    target?.release();
    await targetLease?.();
    await sourceLease?.();
  }
}
