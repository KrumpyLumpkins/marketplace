import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "./migrate.mjs";
import { provisionRoles } from "./roles.mjs";
import {
  importSqlite,
  verifySqliteImport,
  initializeRegistry,
} from "./import-sqlite.mjs";
import { address } from "../domain.mjs";
export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv,
    options = {};
  const flags = new Set(["frozen", "credentials-stdin"]);
  const allowed = new Set([
    "registry",
    "chain",
    "sqlite",
    "app",
    "assets",
    "out",
  ]);
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, "");
    if (
      !rest[i].startsWith("--") ||
      (!flags.has(key) && !allowed.has(key)) ||
      key in options
    )
      throw new Error("Invalid migration option");
    options[key] = flags.has(key) ? true : rest[++i];
  }
  if (
    ![
      "migrate",
      "provision",
      "initialize",
      "import",
      "verify",
      "cutover",
      "status",
    ].includes(command)
  )
    throw new Error(
      "Choose migrate, provision, initialize, import, verify or cutover",
    );
  // Railway SSH stdin keeps database passwords out of process arguments and logs.
  const credentials = options["credentials-stdin"]
    ? JSON.parse(readFileSync(0, "utf8"))
    : {};
  const connectionString = credentials.databaseUrl ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Database connection is required");
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 15000,
    application_name: "marketplace-migration",
  });
  pool.on("error", () => {});
  let result;
  try {
    if (command === "status") {
      const exists = (
        await pool.query("SELECT to_regclass('chain.meta') AS table_name")
      ).rows[0]?.table_name;
      result = exists
        ? {
            initialized: true,
            metadata: (
              await pool.query(
                "SELECT key,value FROM chain.meta WHERE key IN ('identity','migration_source','migration_cutover','generation') ORDER BY key",
              )
            ).rows,
          }
        : { initialized: false };
    } else if (command === "migrate") {
      await migrate(pool);
      result = { migrated: true };
    } else if (command === "provision") {
      await migrate(pool);
      await provisionRoles(pool, credentials.roles);
      result = {
        roles: Object.fromEntries(
          Object.entries(credentials.roles).map(([key, value]) => [
            key,
            value.name,
          ]),
        ),
      };
    } else {
      const registry = JSON.parse(
        options.registry
          ? readFileSync(options.registry, "utf8")
          : process.env.MARKETPLACE_REGISTRY_JSON ||
              readFileSync(
                new URL(
                  "../../../../config/marketplace/registry.json",
                  import.meta.url,
                ),
                "utf8",
              ),
      );
      const chain = options.chain ?? process.env.MARKETPLACE_CHAIN;
      if (!registry?.chains?.[chain])
        throw new Error("Select a registered chain");
      const config = registry.chains[chain],
        identity = {
          chainId: "0x" + BigInt(config.chainId).toString(16),
          marketplace: config.marketplace ? address(config.marketplace) : null,
        };
      if (command === "initialize") {
        await migrate(pool);
        await initializeRegistry(pool, config);
        result = { initialized: true, identity };
      } else {
        if (!options.sqlite)
          throw new Error("Provide paired SQLite snapshot paths");
        const input = {
          pool,
          chainPath: options.sqlite,
          appPath: options.app,
          assetDir: options.assets,
          identity,
          sourceFrozen: options.frozen === true,
        };
        const priorCutover =
          command === "cutover"
            ? (
                await pool.query(
                  "SELECT value FROM chain.meta WHERE key='migration_cutover'",
                )
              ).rows[0]?.value
            : null;
        if (
          priorCutover &&
          (priorCutover.identity.chainId !== identity.chainId ||
            priorCutover.identity.marketplace !== identity.marketplace)
        )
          throw new Error("Cutover identity mismatch");
        result = priorCutover
          ? { alreadyCutOver: true, record: priorCutover }
          : command === "import"
            ? await importSqlite(input)
            : await verifySqliteImport(input);
        if (command === "cutover" && !priorCutover) {
          if (!options.frozen)
            throw new Error(
              "Cutover requires frozen source and candidate writers",
            );
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              "SELECT pg_advisory_xact_lock(hashtext('biblio-projections'),1)",
            );
            const imported = (
              await client.query(
                "SELECT value FROM chain.meta WHERE key='migration_source'",
              )
            ).rows[0]?.value;
            if (!imported?.verified)
              throw new Error("Verified import record is required");
            const head = (
              await client.query(
                "SELECT number,hash FROM chain.blocks ORDER BY number DESC LIMIT 1",
              )
            ).rows[0];
            if (
              (head ? Number(head.number) : null) !==
                (imported.head?.number ?? null) ||
              (head?.hash ?? null) !== (imported.head?.hash ?? null)
            )
              throw new Error("Candidate advanced before cutover verification");
            const prior = (
              await client.query(
                "SELECT value FROM chain.meta WHERE key='migration_cutover'",
              )
            ).rows[0];
            if (!prior) {
              await client.query(
                "UPDATE chain.meta SET value=to_jsonb((value::text)::bigint+1) WHERE key='generation'",
              );
              await client.query(
                "INSERT INTO chain.meta VALUES('migration_cutover',$1)",
                [
                  {
                    at: new Date().toISOString(),
                    identity,
                    head: imported.head,
                  },
                ],
              );
            }
            await client.query("COMMIT");
            result = {
              ...result,
              cutoverReady: true,
              cursorsInvalidated: true,
            };
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }
      }
    }
    if (options.out)
      writeFileSync(options.out, JSON.stringify(result, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    console.log(JSON.stringify(result));
    return result;
  } finally {
    await pool.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(
      JSON.stringify({
        error: "PostgreSQL operation failed",
        code: error.code ?? "MIGRATION_FAILED",
      }),
    );
    process.exitCode = 1;
  });
