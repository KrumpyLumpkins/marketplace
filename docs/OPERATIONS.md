# Operating the owned marketplace

Railway is the selected staging/production host. Follow [Railway setup](RAILWAY.md)
for its two-service topology and per-environment volumes. The native/Compose
instructions below remain useful for local rehearsal on a shared host.

## Deployment boundaries

Use one chain database per chain and marketplace deployment. Keep application state in its adjacent `.app` file and assets in the configured directory. Run one indexing worker and one metadata worker per database. The API supports 1–8 Node workers with `MARKETPLACE_API_WORKERS`; keep embedded indexing off when using multiple API workers. SQLite WAL permits readers during a writer transaction; this topology is not high availability.

Deploy the non-upgradeable marketplace with explicit administrator, protocol fee basis points (0–500) and fee recipient. Enable each reviewed ERC-721 collection and standard ERC-20 currency through administrator transactions. Record the source/compiler/class hashes, deployment block and administration addresses in the registry. Production addresses are deliberately unset. An immutable contract change requires a new deployment and an explicit migration.

Build without the `fixtures` feature for release. Keep private keys out of the backend: it verifies account signatures and may relay already-signed wallet invokes through `/rpc`, but never constructs signatures or holds custody. Operator authorization is separate from wallet sessions.

## Release procedure

For on-chain declaration/deployment and multisig configuration, use the
[mainnet deployment sequence](MAINNET-DEPLOYMENT.md). Its generated registry and
environment templates feed the service steps below. It does not modify live
configuration or automatically activate trading.

1. Resolve the build plan's open launch gates and record the intended Git commit,
   chain, contract address/class/start block, administrator/fee recipient/rate,
   reviewed collection/currency registry, public origin, RPC endpoints and operator.
   The checked-in registry has no deployed marketplace; it cannot enable live trading.
2. Run `pnpm install --frozen-lockfile`, `pnpm release:audit`, then `pnpm release:verify` on the release
   checkout. This command builds for local fixtures; step 4 rebuilds for the actual
   deployment. Run remote CI as well. Record results against the exact commit.
   SDK packages must build before Next.js; HTTPS development follows the same rule.
3. Create local `.env.backend` and `.env.frontend` from the matching examples.
   Use HTTPS for the public origin and an independent operator secret. Set
   `NEXT_PUBLIC_SITE_URL` to that origin. Keep frontend/backend chain and marketplace
   addresses identical. Never put operator credentials or private RPC credentials
   in `NEXT_PUBLIC_*` variables. The default same-origin API proxy avoids exposing
   the private backend URL to browser code.
4. Build and start the frontend with those explicit environment files:

   ```sh
   pnpm sdk:build
   node --env-file=.env.frontend node_modules/next/dist/bin/next build
   node --env-file=.env.frontend node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
   ```

   `NEXT_PUBLIC_*` values and the API rewrite destination are fixed during the build;
   build separately for each environment. `.env.frontend` is not a Next.js automatic
   filename. Ensure a local `.env.local` cannot supply unintended omitted values in
   a release checkout. The current font build needs Google font download access.
5. For the backend, use the native commands in README or
   `docker compose -f compose.backend.yml up -d --build`. The latter requires
   `.env.backend` and a working Docker daemon. Keep embedded indexing disabled:
   Compose already starts separate index and metadata workers. The shared volume
   holds chain/app databases and assets. Backend port 3100 is bound to loopback;
   terminate frontend HTTPS at the chosen reverse proxy/platform. The native
   frontend must reach `MARKETPLACE_API_URL`; another container would need the
   backend's service hostname rather than its own localhost.
6. Complete onboarding/backfill and external reconciliation below. Check
   `/health/live` for process liveness and `/health/ready` for trading readiness.
   A 503 while syncing, paused or undeployed is expected; a healthy container is
   not sufficient evidence to enable trading. Rehearse wallet signatures,
   accepted/indexed recovery, operator authorization, backups and rollback on
   Sepolia before mainnet exposure.

Deploying the frontend alone is a browse/demo release, not a marketplace launch.
Do not copy fixture databases, test assets or devnet addresses into a deployment.
`.dockerignore` excludes local environments, data, keys, caches and test artifacts
from container build contexts. Archive investigation output under `.context/archive`;
keep active server logs and `.context/toolchain` available to their running tools.

## Realms-only indexing baseline

Initial launch scope is Realms ERC-721 only. For pre-deployment historical
investigation, set `MARKETPLACE_CHAIN=SN_MAIN` and
`MARKETPLACE_REGISTRY_PATH=config/marketplace/registry.realms.json` in a separate
local backend environment. Select a new scratch `MARKETPLACE_DB`; do not reuse a
populated multi-collection database, whose persisted collection rows remain.
Clear marketplace address/class/start-block overrides for this NFT-only profile.
The profile deliberately has no marketplace identity or approved currencies, so
it cannot establish checkout readiness. Mainnet RPC verified contract absence at
664161 and presence at 664162 on 8 October 2026. Recheck class identity at the
acceptance checkpoint; this deployment-boundary probe does not establish complete
history or ownership reconciliation.

Production uses the deployment export with only Realms approved, reviewed payment
currencies and the verified marketplace identity. Start a fresh production DB;
the NFT-only scratch database cannot be promoted by changing its identity. The
broader default registry is a development candidate list, not the launch allowlist.

## Indexer rollout order

Use the [launch plan](BUILD-PLAN.md#10-launch-sequence-indexer-rollout-and-migration)
for stage ownership and go/no-go criteria. After the mainnet contract is deployed
and configured paused, use its exported registry in a **new** chain database.
The native bootstrap sequence below assumes `.env.backend` points to that registry,
DB and asset directory and no live index worker is running against the candidate:

```sh
# Set CHECKPOINT_HEIGHT to an independently recorded accepted block H.
: "${CHECKPOINT_HEIGHT:?Set the reviewed checkpoint height first}"
MARKETPLACE_STOP_BLOCK="$CHECKPOINT_HEIGHT" node --env-file=.env.backend services/marketplace-backend/src/indexer-cli.mjs backfill
node --env-file=.env.backend services/marketplace-backend/src/indexer-cli.mjs reconcile
```

Record H's hash and compare at that same hash. The second command is a projection
digest, not external chain reconciliation; compare before starting metadata, whose
fetched data/timestamps can change the digest. After the backfill exits and its
verification passes, start one live `worker.mjs index`, one `worker.mjs metadata`
and the API using the native commands in README or the equivalent supervised
services. Never run the bounded backfill and live scanner on the same DB together.

While paused, `/health/ready` returns 503 by design. Use `/health/live`, catalog
browse probes and `/v1/chains/{chain}/indexer/status`; after catch-up the remaining
readiness reason should be `PAUSED` only. Source progress, metadata/media coverage
and collection trust approval are separate acceptance evidence. The ready check
currently hardcodes a 2-block lag and 15-second head-observation limit.

`MARKETPLACE_RPC_FALLBACK_URL` can cover ordinary transport calls, but event-page
requests explicitly pin the first endpoint. Rehearse an operator-controlled primary
swap/restart; do not claim automatic event-range failover from the fallback setting
alone. Replacing the primary must retain the same chain and reviewed source history.

## Collection onboarding

1. Verify contract address/class, ERC-721 interface, transfer/approval layouts, token URI encoding, royalties, dynamic metadata and any game eligibility rules at a fixed checkpoint. Determine the earliest required historical block.
2. Add the collection to a reviewed copy of the registry. Backfill a **new chain database** with the complete registry using `indexer-cli.mjs backfill`; preserve the production `.app` database separately. Starting a new historical source against an already advanced database fails with `SOURCE_BACKFILL_REQUIRED`.
3. Run `indexer-cli.mjs reconcile` on fresh and repeated replays at the same stop block. Compare token owners and order state against direct RPC reads, and inspect metadata coverage. The reconcile digest is a projection comparison, not a substitute for direct chain reconciliation.
4. Stop the writer, take a paired backup, switch the chain database and registry together, reconnect the existing application database, and restart. Publish only after all required source progress is current. Keep the previous chain database for rollback.
5. Set verified status through the operator endpoint only after address/name review. Verification and moderation decisions live in the durable application database and survive chain replay.

The checked-in mainnet registry is an onboarding candidate list, not evidence that all game-specific contracts have passed this process. Mutating game eligibility needs a collection-specific authoritative policy before enabling those assets for trading.

## Recovery and backups

```sh
node --env-file=.env.backend services/marketplace-backend/src/backup.mjs /backups/market-2026-10-06.sqlite
```

This creates chain and `.app` backups using SQLite's backup API. Ship both plus the registry and asset directory to off-host storage. Set a scheduled backup outside the application and alert when its age exceeds the agreed RPO. The two database copies are individually consistent, not a cross-database atomic snapshot; notification reconciliation repairs the derived outbox while preserving read state.

For restore, stop all three processes, preserve the current files, restore both database files and assets, run `PRAGMA integrity_check` on each, then restart the index worker before admitting traffic. Reconcile canonical chain state, notification state and source freshness. The native backup test exercises a small fixture restore; production-size restore time is still a launch gate.

For a rewind, stop the index worker and run `indexer-cli.mjs rewind HEIGHT`, then resume scanning. Rewind preserves raw journal evidence, session/report data and notification read state, invalidates orphaned alerts, and bumps pagination generation. A full rebuild uses a new chain file and preserves the `.app` file. Never delete application data as part of a chain rebuild.

## Health and incidents

- `/health/live`: process liveness.
- `/health/ready`: trading readiness (503 while undeployed, stale, paused, identity-unverified or syncing). Collection verification badges and metadata coverage are separate operator checks.
- `/v1/chains/{chain}/indexer/status`: source progress, observed head/time, lag, generation and blocking reasons.
- Worker stdout/stderr: structured progress/error records. Alert on stopped workers, lag, stale observations, identity errors, failed backups, disk pressure and metadata failures.

Set `MARKETPLACE_RPC_FALLBACK_URL` for transport failover. Event pagination is pinned to one endpoint within each range; an outage retries the range rather than mixing continuation tokens across providers. Unknown marketplace events, inconsistent receipts, class mismatches and missing historical source coverage fail closed.

Retain browse availability during bounded staleness; wallet writes remain disabled. Accepted transactions retain their hash if receipt/index checks fail, so users can check the saved transaction instead of submitting a duplicate. Paused markets still allow contract cancellation.

## Content and authentication

Set an independent random `MARKETPLACE_OPERATOR_TOKEN`; do not reuse a wallet key. `/operator` holds that credential only in component memory. Reports and moderation changes are authenticated and audited. Hidden collection content is removed from public discovery/detail. A content decision does not alter on-chain ownership or forcibly cancel orders; publish an operating/appeals policy before launch.

Wallet sessions use single-use, five-minute, origin-bound SNIP-12 challenges and on-chain `is_valid_signature` verification. Cookies are HttpOnly, SameSite=Strict and Secure on HTTPS. The devnet account verification test passed; Controller, Ready and Braavos still need real supported-wallet rehearsal. The retained Starknet React/Controller stack uses Starknet.js 8; upgrading it to a supported release is a launch-readiness task separate from the dependency-free backend.

## Dependency audit — 7 October 2026

Production dependency audit initially reported 2 critical, 41 high, 50 moderate
and 4 low findings. Next.js and its ESLint configuration were updated from
16.1.6 to 16.3.6; compatible-range transitive updates were applied. The resulting
registry report was **0 critical, 19 high, 33 moderate and 1 low**. Advisory counts
are not proof that every affected code path is exposed by this application.

The follow-up remediation resolves all 19 high findings with same-major transitive
overrides in `pnpm-workspace.yaml`: `axios` 1.20.0, `defu` 6.1.5, `form-data` 4.0.6,
`h3` 1.15.9, and `ws` 8.21.0 / 7.5.11. The WebSocket overrides target the wallet
parents individually so their 7.x and 8.x peer contracts remain intact. The current
production report is **0 critical, 0 high, 5 moderate and 0 low**; no advisories are
suppressed. The five moderate findings concern `bn.js`, `uuid` and `stream-json`.
`pnpm release:audit` passes and is now a CI gate. Re-run it against the final
lockfile; a passing fixture verification does not override this gate.

Remove the overrides once upstream packages resolve patched versions. Cartridge
0.14.2 moves to Starknet.js 10 and the renamed wallet interface package, so that
API migration is separate from this remediation. The retained wallet stack still
needs real-wallet rehearsal and its existing React peer mismatch remains open.

Starknet Foundry (`snforge` and `sncast`) and `snforge_std` now use **0.64.1**;
Universal Sierra Compiler uses **2.10.2**. Official macOS arm64 archives were checked
against GitHub release SHA-256 digests before installation. Scarb remains **2.15.1**
to preserve production artifacts. Foundry recommends Scarb 2.18.0 or newer, but all
30 contract tests, including 512 fuzz cases, pass on the pinned compiler. CI uses
`setup-snfoundry` 6.0.0, whose composite action forwards the requested version;
the old v4 action did not forward that input to its implementation.

Post-remediation `pnpm install --frozen-lockfile`, `pnpm release:audit` and the full
`pnpm release:verify` passed locally: 587 unit/Storybook tests, 40 SDK tests plus
packed consumers, 34 backend tests, 30 Cairo tests, lint/typecheck, Next/Storybook
builds and four browser smoke flows (one optional screenshot test skipped).
Coverage remains 81.97% statements / 70.67% branches. A non-fixture build matches
the checked-in class hash, compiled class hash, source hash and ABI. These are
fixture regressions, not supported-wallet signing or production launch evidence.

The Next.js update covers the reported
[AVIF optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)
and [Windows server advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36).
Docker Compose syntax validates against the example environment, but a Docker
daemon did not respond during this local preparation. Image build/container boot
and production inputs remain unverified. No infrastructure was deployed.

## Release gates

Independent contract audit, mainnet-fork collection/currency compatibility, mainnet-fork resource checks (the local account 25-item benchmark passes), supported-wallet end-to-end trading, full historical backfill/reconciliation, representative load and recovery drills, named operator/hosting budget, Sepolia rehearsal and seven-day soak remain required. Do not infer production readiness from demo UI screenshots or unit tests.

## Trusted proxy rate limiting

Direct API connections are limited by their normalized TCP peer IP. Forwarded
headers are ignored by default, including loopback callers. For the selected
Railway topology, the checked-in IaC sets
`MARKETPLACE_TRUSTED_PROXY_HOSTS=web.railway.internal`; the API resolves that exact
service hostname and accepts only its relayed `X-Real-IP`. Railway's public edge
sets this header and the Next.js rewrite carries it to the private backend.
`X-Forwarded-For` is never used to establish identity. The backend must have no
public domain/TCP proxy, and web public traffic must enter through Railway HTTP
ingress. See the [Railway client-IP contract](https://station.railway.com/questions/need-authoritative-railway-client-ip-p-b7a7b4bd)
and [header documentation](https://docs.railway.com/networking/public-networking/specs-and-limits).

Other deployments can set comma-separated `MARKETPLACE_TRUSTED_PROXY_ADDRESSES`
and/or `MARKETPLACE_TRUSTED_PROXY_HOSTS` only for a trusted gateway that **overwrites**
`X-Real-IP` from the actual client connection. A bare Next rewrite does not sanitize
client-supplied forwarding headers; do not trust it without that ingress boundary.
DNS results are cached for 30 seconds, and lookup failure grants no new header
trust. Malformed or multi-value IP headers fall back to the TCP peer. Each visitor
retains the 300-request/minute quota; `/health/live` is exempt from visitor quotas.
Staging still needs a live ingress anti-spoofing and multi-visitor check.

## Historical source boundary changes

Source progress now persists `startBlock` atomically with each block checkpoint.
Moving a configured start earlier than recorded coverage rejects further scans
with `SOURCE_BACKFILL_REQUIRED`; API readiness checks the same boundary immediately,
even before another scanner run. Old progress without a recorded start is
unverified and requires a fresh backfill database. Moving the configured boundary
later never rewrites the original covered start. Preserve the adjacent application
database when replacing chain history, following the onboarding procedure above.
