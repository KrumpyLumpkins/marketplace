# PostgreSQL operation and SQLite migration

The production target is PostgreSQL 18.6, accessed with `pg` 8.23.1 on Node
22.23.3. The owned Starknet RPC scanner, Cairo deployment and public SDK/API stay
the same. SQLite remains available for fixtures and migration rollback. Deployment
status and outstanding launch gates belong in [the build plan](BUILD-PLAN.md).

## Boundaries

Each Railway environment has its own database and secrets. `backend` serves HTTP;
`indexer` scans ordered blocks; `metadata` fetches metadata and media. Only `web`
is public. Database traffic uses Railway private networking. No signing key is
uploaded to any service.

- `chain`: canonical blocks, raw events, rewind records, progress, identity and
  notification outbox. A block's projections, events and checkpoint commit in one
  transaction. The scanner holds a session advisory lease; losing it stops writes.
- `market`: separate token, order, activity, approval, configuration, metadata,
  attribute and statistics tables. Indexed generated columns support catalog reads;
  decimal strings and `numeric(78,0)` preserve uint256 values exactly.
- `app`: wallet challenges/sessions, reports, moderation, verification, audit and
  notification read state. Chain rewind does not delete application state.
- `media`: immutable content-addressed binary assets, limited to 10 MiB each.
  This avoids a shared filesystem between API and metadata services. Monitor size;
  an object store can replace this repository later without changing asset URLs.

The API role reads market/chain/media and writes application data. The index role
writes chain projections but cannot access application tables. The metadata role
writes only metadata, jobs, attributes and media; it cannot change ownership.
Schema migrations use a separate administrator connection, never a runtime role.
Migrations are checksummed; add a new migration instead of editing applied SQL.

Pools default to 10 API connections and 4 per worker in Railway. Read requests
hold one repeatable-read snapshot. Projection transactions share a short advisory
lock to coordinate metadata completion with rewind; RPC and media downloads occur
outside that transaction. One database instance is not a high-availability cluster.

## Local validation

Use a disposable PostgreSQL 18 database whose user can create test databases:

```sh
PG_TEST_DATABASE_URL=postgresql://localhost/marketplace_test pnpm backend:pg:test
pnpm backend:test
pnpm railway:check
pnpm release:verify
```

The PostgreSQL suite creates and drops isolated databases. It covers atomic block
failure, process death, scanner lease loss, reorg/application-state preservation,
exact numeric paging, concurrent HTTP reads, challenge replay, role permissions,
metadata races, SQLite migration digests and SQLite/PostgreSQL lifecycle parity.
These tests do not establish production throughput or complete historical coverage.

For a fresh non-production database, supply `DATABASE_URL` through a private local
environment and run `pnpm backend:pg initialize --registry <registry.json> --chain
<chain>`. Provision separate roles before exposing HTTP. Do not initialize or
replace an existing production database to bypass identity checks.

## Railway provisioning

The IaC declares `web`, `backend`, `indexer`, `metadata`, `postgres` and two volumes:
`postgres-data` is active database storage; `marketplace-data` retains the old
SQLite source during migration. Both have daily/weekly Railway backups. Production
volumes are 25 GiB; staging volumes are 5 GiB. Capacity requires monitoring.

```sh
node scripts/railway/postgres-env.mjs staging
railway link --project 554683c6-4840-40d5-a60b-864d7d1f4c25 --environment staging
railway config plan
railway config apply
```

The helper generates missing per-environment secrets, preserves existing secrets
and rollout flags, and writes a mode-0600 credential bundle under ignored
`.context/postgres/`. It prints variable names only. Never commit these files or
print Railway variable values. Repeat for production only after staging validation.

Rollout flags are shared variables referenced by the service graph:

| Variable | Migration state | PostgreSQL state |
| --- | --- | --- |
| `MARKETPLACE_STORE` | `sqlite` | `postgres` |
| `MARKETPLACE_MAINTENANCE` | `true` during final snapshot | `false` after verification |
| `MARKETPLACE_BACKGROUND_ENABLED` | Legacy SQLite workers; set `false` for freeze | `false` |
| `POSTGRES_BACKGROUND_ENABLED` | `false` | `true` in configured production; staging stays `false` until its test deployment exists |

An explicit `MARKETPLACE_STORE=sqlite` overrides a configured `DATABASE_URL` so the
new container can safely run the old database during preparation. Redeploy affected
services after changing flags. A variable update alone is not evidence that old
writers have stopped.

## Verified cutover

1. Deploy the new backend image in explicit SQLite mode. Check its Node version,
   SQLite 3.51.3 or newer, health, source identity and current checkpoint. Keep the
   contract paused throughout this database migration.
2. Provision PostgreSQL schemas and roles with the administrator credential sent
   over SSH stdin. The example below uses the staging credential bundle:

   ```sh
   railway ssh --project 554683c6-4840-40d5-a60b-864d7d1f4c25 \
     --environment staging --service backend -- \
     node services/marketplace-backend/src/postgres/cli.mjs provision \
     --credentials-stdin < .context/postgres/staging-credentials.json
   ```

3. Set maintenance `true` and legacy background `false`, redeploy the backend, and
   verify API POST returns 503 and index/metadata processes have stopped. Stop any
   separate import/candidate writers. Reads may remain available.
4. Create paired chain/application snapshots with SQLite's backup API, and retain
   the frozen assets directory. Do not copy live WAL files arbitrarily. Record
   checkpoint/hash, registry identity, snapshot paths and image revision. Preserve
   a Railway volume backup as well.
5. Run `import --sqlite <snapshot> --app <snapshot.app> --assets <assets> --frozen`
   with the same SSH/credential mechanism. The CLI uses the service's registry and
   chain; explicit `--registry`/`--chain` flags are available. It refuses a populated
   target, mismatched identity, unsupported source data or corrupt source/media.
   The import is atomic and compares row counts plus full-content SHA-256 digests
   for every source table/entity kind, application table and asset before commit.
6. Run `verify` with the same paths. Retain its JSON report, then run `cutover` with
   `--frozen`. This rechecks parity and increments cursor generation. `status`
   reports identity/import/cutover records if an SSH response is interrupted.
   After cutover, the old source is intentionally a different generation; do not
   expect byte-for-byte equality with a subsequently advancing production DB.
7. Set the API to `postgres`, initially retaining maintenance. Deploy the separate
   workers with background disabled. Verify role permissions, data, asset hashes,
   health, chain ID, marketplace identity and ingress header rejection. Then enable
   the production workers, verify advancement from the imported checkpoint, and
   clear maintenance. Staging's empty Sepolia registry must not run mainnet workers.
8. Take and restore a PostgreSQL backup into an isolated database. Keep source
   snapshots and the old volume until the recovery window is formally closed.
   This operation does not authorize contract unpause or complete launch gates.

Before accepting new application writes, rollback can stop PostgreSQL workers and
return the API to the frozen SQLite source. **After PostgreSQL accepts writes, the
old SQLite snapshot is stale.** Prefer rolling back to compatible PostgreSQL code;
freeze and explicitly reconcile newer sessions/reports/moderation/read state before
any reverse migration. Never silently discard those records.

## Backup, restore and monitoring

Use PostgreSQL 18 `pg_dump --format=custom` from the private database environment
and `pg_restore --exit-on-error --no-owner --no-acl` into a separate empty recovery
database. Credentials go through a protected environment or passfile, never command
arguments. Re-provision least-privilege roles on the restored database, check schema
checksums, chain identity/head, application row/content digests and asset hashes,
then rehearse read and rewind paths before routing traffic. A successful dump alone
is not a restore test. `src/backup.mjs` is explicitly SQLite-only.

Railway volume backups complement logical backups; neither daily nor weekly
schedules satisfy the proposed one-hour application recovery-point target. Establish
and test that backup cadence and alert delivery before trading activation. Monitor
free disk, WAL growth, database connections, slow queries, worker error age,
checkpoint lag, metadata queue age and backup/restore failures. The worker's
`/health/live` shows progress/error timestamps; API `/health/ready` still returns
503 while the index is syncing, the contract is paused or prerequisites are absent.
PostgreSQL does not make the RPC backfill faster by itself.

## Recorded cutover — 8 October 2026

Both Railway environments use PostgreSQL. Production was frozen at block 720985
(hash `0x2b617cedc7825402bcedb2aa52479057a8afaba4eb5ffa39a6daade5ee364e`).
Import and a separate Railway PostgreSQL dump/restore matched every source digest:
56,824 blocks, 4,108 events, 3,938 token records, 89 assets and existing application
records. Generation advanced from 1 to 2. Public media hashes and the Realms
verification badge survived; the scanner subsequently advanced beyond 721085.
See [the migration report](evidence/postgres-cutover-2026-10-08.json).

The original SQLite snapshots/volume and the logical dump are retained. This does
not establish completed backfill, peak-load acceptance, automatic failover or the
proposed hourly backup objective. Contract activation remains a separate decision.

## Backfill throughput controls

Strict mode retrieves full receipts for **every** block and compares watched
events with the complete paginated event scan. It retains every block header and
per-block rewind record. A 1,000-block scan window is not a promise of 1,000 blocks
per second.

| Indexer environment variable | Default | Bounds |
| --- | --- | --- |
| `MARKETPLACE_INDEX_WINDOW` | 1000 blocks | 1–1000 |
| `MARKETPLACE_INDEX_RPC_BATCH` | 1 (individual reads) | 1–32 |
| `MARKETPLACE_INDEX_CONCURRENCY` | 8 simultaneous RPC requests/batches | 1–32 |
| `MARKETPLACE_INDEX_COMMIT_BATCH` | 250 validated blocks per transaction | 1–1000 |

Oversized RPC responses split into smaller sequential batches. HTTP/JSON-RPC 429
responses trigger shared bounded backoff; successful items survive while only
throttled items are retried. Unknown/missing/duplicate IDs and coverage mismatches
fail closed. Failed parallel work drains before another scan starts.

Blocks with no watched events are bulk-written when there are no marketplace
listings. Each header and source-progress before-image remains stored. Event
blocks use the normal reducer; once listings exist, ordinary floor-expiry logic
is retained even for empty blocks. This optimization changes execution, not the
schema. The separate historical-range mode below adds schema v2 and has stricter rollback requirements.

Progress logs include `blocksPerSecond`, `acquireMs`, `commitMs` and
`rateLimitedResponses`. Tune against sustained measurements and provider quotas;
higher concurrency can reduce throughput through throttling. Wallet/API/metadata
requests share provider capacity, even though their processes are separate.

An isolated Railway database benchmark on 8 October 2026 committed the same 1,000
empty blocks in 77,228 ms with individual writes versus 132 ms with bulk writes.
Complete header/progress/undo row parity passed. This measures database throughput
only; historical RPC retrieval remains necessary and is separately rate-limited.

Production retains eight individual receipt reads in flight: a matched 256-block
RPC test measured 26.4 blocks/s for that configuration, versus 16.3 blocks/s and
30 rate-limited responses with four 16-block batches. Full receipt digests matched.
JSON-RPC batching remains configurable for providers/quotas that can sustain it;
the current gain comes primarily from bulk database writes and larger scan windows.

During Railway rolling deployment, the replacement indexer serves liveness with
`writerLease: "waiting"` while the old process owns the database lease. It performs
no RPC scan until the old writer stops and the lease becomes `held`. This lets the
platform complete its health-check handover without allowing two writers. Check
`lastProgress` and the lease state, not liveness alone, to confirm active indexing.

The deployed strict scanner's first four 1,000-block windows measured 15.3–23.2
blocks/s (18.5 blocks/s combined). Acquisition took 41.7–65.2 seconds per window;
commits took 0.2–1.5 seconds. The remaining bottleneck is historical RPC retrieval,
including rate limits. [Recorded measurements](evidence/backfill-throughput-2026-10-08.json)
separate these live results from database-only and filtered-event-only probes.

## Fast historical mode (schema v2)

Approved by the user on 8 October 2026. `MARKETPLACE_INDEX_FAST_HISTORY=true` enables
100,000-block historical windows by default (`MARKETPLACE_INDEX_HISTORY_WINDOW`,
maximum 100000). Only the reviewed Realms mainnet address/class profile is supported.
The cutoff is before marketplace deployment and at least 5,000 blocks behind the
observed head, adjusted to a timestamp boundary. A non-finalized range anchor falls
back to strict scanning. Marketplace activity and the recent tail use full receipts.

The event feed is completely paginated and each returned event-bearing block plus
the end anchor is fetched with full receipts. Missing/duplicate reported events,
malformed blocks and changing anchors reject the range. Header/event/entity changes
and source progress commit atomically. `chain.history_ranges` explicitly records the
covered interval; only event-bearing and end-anchor headers are stored for that
interval. A rewind into a sparse range restores the entire range's preceding state.
Application data is preserved.

Before crossing the cutoff, the worker reconciles live NFT supply, every live owner,
token approval, observed operator pair and each live owner's marketplace operator
at pinned hashes. It saves resumable progress in `chain.status` under `history`.
The API returns `HISTORY_RECONCILIATION_REQUIRED` until this passes; a missing
canonical checkpoint also invalidates the certificate. Reconciliation never repairs
mismatches by inventing events or silently replacing ownership.

Realms uses timestamp-based ERC721Votes supply: one voting unit moves per NFT
mint/burn. Supply for block H is read at H+1 using H's timestamp, only when H+1 has
a later timestamp and links directly to H. Both classes/hashes are checked. Source:
[Realms transfer hooks](https://github.com/BibliothecaDAO/lordship-stREALMS/blob/main/stRealms/realms/src/contracts/strealm.cairo)
and [supply checkpoints](https://github.com/BibliothecaDAO/lordship-stREALMS/blob/main/stRealms/realms/src/components/erc721/extensions/erc721_votes.cairo).
A direct mainnet probe at H=16050532 reported 5,132 live NFTs.

Migration order: apply schema v2 and re-provision runtime grants; deploy the API
readiness gate and compatible worker; preserve a logical backup; then enable fast
mode on the production indexer. Staging stays disabled without its test deployment.
After sparse ranges exist, rollback uses a schema-v2-compatible release with fast
mode disabled. Do not deploy the original dense-only indexer or restore an old
snapshot over newer application writes. Contract activation remains separate.

An isolated live-data shadow run advanced 100,000 blocks from checkpoint 818028 in
42,173 ms (2,371 blocks/s), verifying 372 receipt blocks and projecting 483 NFT
activity events. The production worker was still running during this measurement.
Actual range throughput varies with event density and RPC throttling; retrieval-only
benchmarks and strict-mode block rates are not directly interchangeable.

Production enabled this release on 8 October 2026 after schema/API rollout and a
readable logical backup. Its first three consecutive ranges advanced 300,000 blocks
at 2,383–4,809 blocks/s (3,110 combined), with no rate-limit responses. The API
returned `HISTORY_RECONCILIATION_REQUIRED` and `safeForCheckout=false`; the contract
remained paused. Backfill and pinned reconciliation were still pending at capture.
See [production evidence](evidence/fast-history-2026-10-08.json). These early ranges
do not establish a sustained whole-history rate or completion time.
