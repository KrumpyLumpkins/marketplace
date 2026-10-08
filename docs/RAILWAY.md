# Railway staging and production

Railway is the selected host for the complete marketplace, confirmed 8 October
2026. The supplied project `554683c6-4840-40d5-a60b-864d7d1f4c25` is provisioned with
staging and production services and persistent volume instances. Production is connected to the paused mainnet deployment and its index/metadata
workers are backfilling Realms history. Staging services are deployed but still
use a verified PublicNode Sepolia RPC but need a funded Sepolia deployer and test deployment. Trading remains disabled. Existing Vercel previews are historical. `vercel.json` disables automatic Git
deployments per [Vercel configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments); removing the installed integration itself remains an account setting.

## Topology

One project, `realms-marketplace`, with two isolated Railway environments:

| Environment | Chain | Services | Persistent storage |
| --- | --- | --- | --- |
| `staging` | Starknet Sepolia | `web`, `backend`, `indexer`, `metadata`, `postgres` | Independent PostgreSQL volume; retained SQLite rollback volume |
| `production` | Starknet mainnet | `web`, `backend`, `indexer`, `metadata`, `postgres` | Independent PostgreSQL volume; retained SQLite rollback volume |

Both environments now use PostgreSQL. Follow [the migration runbook](POSTGRES-OPERATIONS.md)
and the build plan's evidence before changing store selection. `backend` serves
HTTP, `indexer` owns the ordered scanner lease, and `metadata` handles enrichment.
Workers share PostgreSQL through private networking and have distinct restricted
roles. Staging workers stay disabled until its Sepolia registry is deployed.

Services default to Singapore. PostgreSQL storage is 25 GiB in production and
5 GiB in staging, with daily/weekly volume backups. The old `marketplace-data`
volume remains attached to backend for rollback. While it is retained, backend
still runs one replica with no deployment overlap. PostgreSQL itself is a single
instance; this is not automatic failover or a high-availability claim. Monitor
actual data/WAL/media growth and provision capacity before exhaustion.

The frontend is a Next.js standalone container. It proxies `/api/marketplace/*`
over `http://backend.railway.internal:3100` and exposes port 3000. Only `web` needs
a public HTTPS domain. Backend binds dual-stack `::` for Railway private networking.
Neither the backend nor frontend contains deployment signing keys.

## Configuration files and local verification

- `.railway/railway.ts`: current Railway project/environment IaC, with the pinned
  development-only `railway` SDK. The backend uses the approved `pg` driver.
- `infra/railway/frontend.Dockerfile`: frozen pnpm install, SDK and Next build,
  minimal standalone runtime as user `node`.
- `infra/railway/backend.Dockerfile`: Node built-ins, pinned `pg` and a supervised per-service entrypoint.
  It runs as root because Railway mounts the persistent volume as root. Volume
  presence and write access are checked before starting the API.
- `infra/railway/variables.example.json`: environment-specific **shared variable**
  checklist, containing placeholders only. Do not import it unchanged.

```sh
pnpm install --frozen-lockfile
pnpm railway:check
pnpm backend:test
pnpm release:verify
```

`railway:check` validates both resource graphs using the SDK and enforces chain,
volume, healthcheck, replica and secret-boundary constraints. It is included in
CI. It does not contact Railway or establish that containers boot on the platform.

Railway's current [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
uses `.railway/railway.ts`. New services cannot use the deprecated per-service
`railway.json` configuration. The file intentionally declares no GitHub source;
applying the graph creates configuration, while uploading an explicitly reviewed
checkout deploys the application. Do not turn on production auto-deploys as part
of initial provisioning.

## Inspect or update the existing environments

The CLI must be authenticated in the intended workspace. The graph owns the
entire environment: use a dedicated project, never an unrelated existing project.

```sh
railway link --project 554683c6-4840-40d5-a60b-864d7d1f4c25 --environment staging
railway environment list
railway status
```

Both environments already exist; do not initialize a second project or duplicate
production data. Configure shared variables separately in each environment, then
preview changes against that explicit environment:

```sh
railway environment link staging
railway config plan
# Review the plan, then apply that environment's configuration.
railway config apply
```

Select `production` explicitly before changing its configuration. Plan/apply can create billable
volumes; no apply is part of local validation. Do not duplicate production volume
data, secrets or deployment identities into staging. Check both environments
have distinct volume-instance IDs before uploading an application. Railway may
reuse the logical volume ID across environments; the instances hold separate data.

Shared variables (defined in Railway, referenced by the IaC):

| Variable | Required value |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS frontend origin for this environment; no trailing slash |
| `OPERATOR_TOKEN` | Unique random secret per environment; backend access only |
| `STARKNET_RPC_URL` | Mainnet RPC in production, Sepolia RPC in staging; never expose credentials to web |
| `STARKNET_RPC_FALLBACK_URL` | Independently configured fallback, or empty |
| `MARKETPLACE_REGISTRY_JSON` | Full generated deployment registry JSON; empty only for initial undeployed setup |
| `MARKETPLACE_BACKGROUND_ENABLED` | Legacy SQLite workers only; `false` after migration |
| `MARKETPLACE_STORE`, `MARKETPLACE_MAINTENANCE`, `POSTGRES_BACKGROUND_ENABLED` | Cutover flags documented in the PostgreSQL runbook |
| `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_API_DATABASE_URL`, `POSTGRES_INDEX_DATABASE_URL`, `POSTGRES_METADATA_DATABASE_URL` | Generated separately for each environment by `scripts/railway/postgres-env.mjs` |
| `MARKETPLACE_ADDRESS` | Reviewed settlement deployment address, or empty while undeployed |
| `MARKETPLACE_COLLECTIONS` | Frontend collection configuration from the deployment export, or empty while undeployed |

Mainnet defaults to the repository's Realms-only NFT profile when registry JSON is
empty; staging defaults to an empty Sepolia collection registry. Neither is a
completed marketplace deployment. Supply the matching chain's reviewed deployment
export to `MARKETPLACE_REGISTRY_JSON` before enabling workers. Production's approved
NFT list contains **only Realms**. Staging uses `https://starknet-sepolia-rpc.publicnode.com` (chain ID verified). It requires a funded testnet deployer, a real Sepolia test NFT and
settlement deployment; never substitute the mainnet Realms address on Sepolia.
The backend reads inline registry JSON without writing it into the image or volume.

Generate the `web` Railway HTTPS domain (target port 3000) or attach a custom domain
before the first frontend build, then set `PUBLIC_ORIGIN` to it. Leave backend
public networking disabled. `MARKETPLACE_API_URL`, public chain/address/collections
and site origin are baked into the frontend build; **rebuild web after changing
any of them**, including when promoting the same Git commit between environments.
Private RPC URLs and operator credentials are referenced only by backend.

## Build and deploy sequence

1. Complete the build plan's relevant gates and record the reviewed Git SHA.
2. Link the intended environment and verify `railway status`; apply only its graph.
3. Supply registry/RPC/origin/secrets, with background workers initially disabled.
4. Upload backend first, from the repository root: `railway up --service backend`.
   Verify volume mount, `/health/live` and logs. Enable workers after reviewing the
   source registry and RPC. Catch-up happens in the sole index worker.
5. Upload frontend: `railway up --service web`. Verify `/health`, same-origin API
   proxy, asset delivery, auth cookies and exact chain/deployment identity.
6. Complete historical backfill/reconciliation and staging wallet/recovery/soak
   gates before a production trading launch. Deploying containers never activates
   the Cairo contract; its separate reviewed activation remains required.

`/health/live` is the backend deployment healthcheck so backfill and a paused market
do not create a restart loop. `/health/ready` is the trading-readiness signal and
must be monitored separately. Frontend `/health` checks process liveness only.
Railway deployment healthchecks are not a substitute for ongoing freshness alerts.

To run a bounded backfill or rewind manually, first set
`MARKETPLACE_BACKGROUND_ENABLED=false` and redeploy backend; use Railway SSH to
run the native CLI inside that service with its mounted volume and variables.
Do not run a second scanner beside the supervised worker. `railway run` executes
locally and does not grant access to Railway's mounted database.

## Backups and rollback

Daily and weekly Railway volume backups are configured in each environment. Add
off-host backups of both
SQLite files made with the native backup tool. Include the registry and asset
files. A backup cron deployed as another service cannot access this volume: run
backup creation within backend via an external operator job/SSH and copy the
result off-host. Railway snapshot schedules are installed; automated off-host delivery is not. Rehearse restoring both files and preserving application
reports/read state before launch.

Roll back application code to a compatible release without resetting its volume.
A contract or registry identity change requires the documented fresh-database
migration; do not edit production identity and silently reuse `/data/chain.sqlite`.
Never delete/recreate a volume as a deployment retry. Alerts, RPC quota sizing,
full backfill/reconciliation, public-wallet testing and production restore remain
launch gates in [BUILD-PLAN.md](BUILD-PLAN.md).

## Local verification — 8 October 2026

Both Docker images built successfully. An isolated local Docker network and fresh
volume verified web/backend health, same-origin proxying, fail-closed trading
readiness while RPC was unavailable, homepage rendering and all three backend
processes. Killing the index worker caused the service to exit nonzero; restarting
preserved a SQLite marker on the volume. Temporary containers, volume and network
were removed afterward. Both environment graphs, backend tests, typecheck, lint
and the production high-severity dependency audit passed. Cloud boot, domains and
ingress checks subsequently passed as recorded below. External monitoring,
off-host backup delivery and a production-size restore remain launch work.

The backend rate limiter trusts client identity only from the exact private
`web.railway.internal` peer, resolved through environment-local DNS. Its relayed
`X-Real-IP` must originate from Railway public HTTP ingress. The required edge rule
rejects requests that arrive with caller-supplied `X-Real-IP` before the platform
sets it. Default Railway ingress was observed preserving forged values, so the
rule is required; an assumed header overwrite is insufficient. Do not expose
backend publicly or bypass this ingress policy.
See [trusted proxy rate limiting](OPERATIONS.md#trusted-proxy-rate-limiting) for
configuration and the required staging verification.

## Variable CLI

The repository is configured for project
`554683c6-4840-40d5-a60b-864d7d1f4c25` (`realms-marketplace`). Use the following
helper to update environment-scoped **shared** variables; service settings
reference these values through the IaC. This avoids replacing a service's shared
reference with an unrelated service-only override.

```sh
pnpm railway:variable -- staging STARKNET_RPC_URL
pnpm railway:variable -- production STARKNET_RPC_URL
```

It reads hidden input in an interactive terminal or accepts the value on stdin.
It never includes the value in CLI arguments or output, and does not trigger a
deployment. Supported names are the shared variables in the table above.
For the complete reviewed deployment registry:

```sh
pnpm railway:variable -- staging MARKETPLACE_REGISTRY_JSON < /absolute/path/to/sepolia/registry.json
pnpm railway:variable -- staging MARKETPLACE_ADDRESS
pnpm railway:variable -- staging MARKETPLACE_COLLECTIONS
```

Use `production` for the corresponding reviewed mainnet values. After runtime
backend changes, redeploy backend in that environment. After changing public
origin/address/collections, rebuild and upload web because Next.js embeds those
values at build time. For example:

```sh
railway redeploy --project 554683c6-4840-40d5-a60b-864d7d1f4c25 --environment staging --service backend --yes
railway up --project 554683c6-4840-40d5-a60b-864d7d1f4c25 --environment staging --service web --detach
```

Use `pnpm contracts:env` for the local Starknet deployment private key, RPC URL
and signer address. The Railway helper refuses private-key/signer variables;
those are not backend configuration.

## Provisioned environment record — 8 October 2026

| Environment | Public frontend | Chain | Volume instance |
| --- | --- | --- | --- |
| Staging | https://web-staging-6d26.up.railway.app | Sepolia | `b7ca9bae-9062-43eb-a7e1-a0364143717e` |
| Production | https://web-production-2a4cb.up.railway.app | Mainnet | `ae2b83f2-206e-414b-b8a5-0343881c4e53` |

Both use the logical `web` and `backend` services with separate environment-local
instances. The auto-detected SDK-only services were removed. Only web has public
networking. Daily and weekly snapshots are enabled on each volume instance.
Separate operator secrets were generated; no signing key was stored in Railway.
The frontend process was checked to contain neither operator nor RPC credentials.

Frontend and proxied backend liveness return 200. Trading readiness deliberately
returns 503 with no marketplace deployment/RPC configured. Production exposes
only the Realms collection; no complete historical backfill is claimed. Workers
remain disabled until reviewed registry/RPC inputs and capacity checks are ready.
Infrastructure is running; this is not contract activation or a trading launch.

### Required ingress identity rule

The edge rule is managed separately from the IaC SDK's service/volume graph:

```sh
pnpm railway:edge -- staging
pnpm railway:edge -- production
```

This CLI reads `infra/railway/edge-rules.json`, validates with Railway, and places
its identity-header rejection first while retaining other rules and their
relative order. It must run when provisioning a fresh environment. The staging
probe reproduced a bypass before the rule, then verified normal traffic,
per-visitor quotas and forged-header rejection after applying it. Default ingress
behavior alone is not sufficient evidence of trusted client identity.

## Mainnet bootstrap — 8 October 2026

Production is connected to the [mainnet registry](../config/marketplace/registry.mainnet.json)
and [verified deployment record](../config/marketplace/deployment.mainnet.json).
The marketplace was deployed at block 16050533 and configured paused at block
16050562. Initial fee is 500 bps; administrator and fee recipient are the approved
local signer. Realms is the only NFT collection; STRK and LORDS are enabled.

Production web: https://web-production-2a4cb.up.railway.app . Backend is private;
the same-origin config endpoint exposes the deployment identity. Indexing starts
at Realms block 664162, not at the marketplace deployment. About 15.4 million
historical blocks remain at bootstrap; do not interpret container health as
checkout readiness. Until marketplace history is reached, indexed configuration
can be absent even though direct on-chain deployment verification has passed.
No activation transaction has been sent. Full backfill/reconciliation, independent
review, public-wallet acceptance and operating gates remain open.
