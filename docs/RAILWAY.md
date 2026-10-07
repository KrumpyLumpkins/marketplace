# Railway staging and production

Railway is the selected host for the complete marketplace, confirmed 8 October
2026. This repository contains configuration only: no project, volume, domain or
service has been provisioned by this work. Existing Vercel previews are historical;
removing that GitHub integration is a separate account setting, not a code deploy.

## Topology

One project, `realms-marketplace`, with two isolated Railway environments:

| Environment | Chain | Services | Persistent storage |
| --- | --- | --- | --- |
| `staging` | Starknet Sepolia | `web`, `backend` | Its own `marketplace-data` volume |
| `production` | Starknet mainnet | `web`, `backend` | Its own `marketplace-data` volume |

Each backend runs three supervised Node processes: API, one index scanner and one
metadata worker. They share `/data/chain.sqlite`, its adjacent `.app` database and
`/data/assets` inside the same service. A child exit stops its peers and exits
nonzero so Railway restarts the group; shutdown sends SIGTERM and escalates to
SIGKILL after five seconds. API embedded indexing is forced off. Workers start
only when `MARKETPLACE_BACKGROUND_ENABLED=true`; initial configuration uses false.

Railway volumes attach to one service and do not support replicas. Separate
Railway API/indexer services cannot share this SQLite volume. Backend replicas
are fixed at one, with no overlapping deployment. Expect brief backend downtime
on redeploy; this is not a high-availability design. Frontend and backend default
to Singapore, with an initial 5 GiB volume per environment; measure the Realms
backfill and resize before capacity becomes tight. This is an initial allocation,
not a measured storage requirement. See [Railway volume limits](https://docs.railway.com/volumes/reference).

The frontend is a Next.js standalone container. It proxies `/api/marketplace/*`
over `http://backend.railway.internal:3100` and exposes port 3000. Only `web` needs
a public HTTPS domain. Backend binds dual-stack `::` for Railway private networking.
Neither the backend nor frontend contains deployment signing keys.

## Configuration files and local verification

- `.railway/railway.ts`: current Railway project/environment IaC, with the pinned
  development-only `railway` SDK. The native backend still has zero runtime packages.
- `infra/railway/frontend.Dockerfile`: frozen pnpm install, SDK and Next build,
  minimal standalone runtime as user `node`.
- `infra/railway/backend.Dockerfile`: Node built-ins only and supervised entrypoint.
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

## Create and configure later

The CLI must be authenticated in the intended workspace. The graph owns the
entire environment: use a dedicated project, never an unrelated existing project.

```sh
# Set RAILWAY_WORKSPACE_ID to the chosen workspace, not a sample ID.
: "${RAILWAY_WORKSPACE_ID:?Select the Railway workspace first}"
railway init --name realms-marketplace --workspace "$RAILWAY_WORKSPACE_ID"
railway environment new staging
railway environment link staging
railway status
```

A new project normally includes `production`; inspect `railway environment list`
before creating any missing environment. Configure the shared variables separately
in each environment, then run a plan against that explicit environment:

```sh
railway environment link staging
railway config plan
# Review the plan, then apply that environment's configuration.
railway config apply
```

Repeat for `production` when ready to provision it. Plan/apply can create billable
volumes; no apply is part of local validation. Do not duplicate production volume
data, secrets or deployment identities into staging. Check both environments
have distinct volume IDs before uploading an application.

Shared variables (defined in Railway, referenced by the IaC):

| Variable | Required value |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS frontend origin for this environment; no trailing slash |
| `OPERATOR_TOKEN` | Unique random secret per environment; seal it in Railway |
| `STARKNET_RPC_URL` | Mainnet RPC in production, Sepolia RPC in staging; seal credentials |
| `STARKNET_RPC_FALLBACK_URL` | Independently configured fallback, or empty |
| `MARKETPLACE_REGISTRY_JSON` | Full generated deployment registry JSON; empty only for initial undeployed setup |
| `MARKETPLACE_BACKGROUND_ENABLED` | `false` during initial setup; `true` after source/RPC review and before backfill |
| `MARKETPLACE_ADDRESS` | Reviewed settlement deployment address, or empty while undeployed |
| `MARKETPLACE_COLLECTIONS` | Frontend collection configuration from the deployment export, or empty while undeployed |

Mainnet defaults to the repository's Realms-only NFT profile when registry JSON is
empty; staging defaults to an empty Sepolia collection registry. Neither is a
completed marketplace deployment. Supply the matching chain's reviewed deployment
export to `MARKETPLACE_REGISTRY_JSON` before enabling workers. Production's approved
NFT list contains **only Realms**. Staging requires a real Sepolia test NFT and
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

Enable Railway volume backups in each environment, plus off-host backups of both
SQLite files made with the native backup tool. Include the registry and asset
files. A backup cron deployed as another service cannot access this volume: run
backup creation within backend via an external operator job/SSH and copy the
result off-host. Automated backup scheduling/off-host delivery is not installed
by this configuration. Rehearse restoring both files and preserving application
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
and the production high-severity dependency audit passed. Railway cloud boot,
domain setup, external monitoring and off-host backups remain unverified.

The backend rate limiter trusts client identity only from the exact private
`web.railway.internal` peer, resolved through environment-local DNS. Its relayed
`X-Real-IP` must originate from Railway public HTTP ingress. Do not expose backend
publicly or add a web ingress path that preserves caller-supplied IP headers.
See [trusted proxy rate limiting](OPERATIONS.md#trusted-proxy-rate-limiting) for
configuration and the required staging verification.
