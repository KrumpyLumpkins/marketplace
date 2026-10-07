# Biblio Marketplace

A Starknet ERC-721 marketplace with standalone Cairo settlement, an owned Node.js indexer/API, and the retained Next.js UI. Trading uses on-chain listings, token offers, one-shot collection offers and atomic carts of up to 25 NFTs in one currency.

The backend uses Node built-ins only. It has no Torii, Dojo or Arcade dependency. Cartridge remains an optional wallet connector; it supplies no marketplace data. Application RPC uses the owned backend relay, with a configurable direct RPC override. Controller manages its own authentication and wallet transport.

## Run locally

Use Node **22.22.0** and pnpm **10.8.1**.

```sh
pnpm install --frozen-lockfile
pnpm backend:demo
```

In another terminal:

```sh
NEXT_PUBLIC_MARKETPLACE_CHAIN_ID=SN_MAIN pnpm dev
```

Open `http://localhost:3000`. Demo assets and orders are illustrative; all wallet trading is disabled. Collection discovery, filters, token details, cart previews, search and the disconnected dashboard work without production credentials.

For a real deployment, use [.env.backend.example](.env.backend.example) and [.env.frontend.example](.env.frontend.example). Supply the RPC, verified marketplace address/class/start block, registry and frontend address. Keep existing local settings and secrets private. Run API, index and metadata workers separately:

```sh
node --env-file=.env.backend services/marketplace-backend/src/server.mjs
node --env-file=.env.backend services/marketplace-backend/src/worker.mjs index
node --env-file=.env.backend services/marketplace-backend/src/worker.mjs metadata
```

The API listens on `127.0.0.1:3100`. Next.js proxies `/api/marketplace` to it. A portable backend container topology is in [compose.backend.yml](compose.backend.yml).

## Component workbench

```sh
pnpm exec playwright install chromium
pnpm storybook
```

Open `http://localhost:6006` to inspect the current theme and exercise isolated UI states. `pnpm storybook:test` runs browser interaction/accessibility checks; `pnpm storybook:build` exports the workbench. `pnpm test:coverage` now combines unit and Storybook browser coverage and requires Chromium. See [Storybook integration](docs/STORYBOOK.md) for fixtures, story authoring and remaining coverage.

Public service status is at `/ops`. Authorized moderation and collection controls are at `/operator`; operator credentials are required for each API action.

## Reusable SDK and React bindings

The marketplace app consumes private workspace packages: [`@biblio/marketplace`](packages/marketplace-sdk/README.md) for TanStack Query Core fetching and trading workflows, and [`@biblio/marketplace-react`](packages/marketplace-react/README.md) for React Query hooks/providers. The indexer remains a separate service with no third-party runtime dependencies. Packages are not published to npm.

```sh
pnpm sdk:build       # ESM, declarations and contract ABI assets
pnpm sdk:test        # Public SDK and React interface tests
pnpm sdk:pack:test   # Isolated consumers of packed artifacts
pnpm sdk:watch       # Rebuild packages while editing SDK code
```

App dev/build/typecheck/test and Storybook scripts build the packages first. While editing SDK sources with a running dev server, also run `sdk:watch`. Consumer examples are in `examples/marketplace-node` and `examples/marketplace-react`; the React example has Storybook interaction/response-state stories. Supply an API endpoint and pinned deployment for trading; consumers provide their own wallet adapter. See package READMEs for signature review, transaction recovery, credential scope and cross-origin limitations.

## Mainnet deployment tooling

Follow [the staged deployment runbook](docs/MAINNET-DEPLOYMENT.md). It covers
read-only identity probes, frozen plans, declaration/deployment, atomic paused
configuration, multisig call exports, receipt recovery and verified environment/
registry handoff. Activation is a separate administrator approval. These scripts
do not close the existing launch gates or authorize a mainnet broadcast.

```sh
pnpm contracts:deploy help
pnpm contracts:deploy:test
# With a localhost devnet running with --state-archive-capacity full:
pnpm contracts:deploy:rehearse
```

## Contract development

Pin Scarb **2.15.1**, Starknet Foundry **0.64.1**, Universal Sierra Compiler **2.10.2**, and devnet **0.10.0**. The test wrapper requires the pinned Foundry version to match `snforge_std`; CI installs the same versions. Foundry recommends a newer Scarb, but this compiler is retained to preserve the reviewed production artifacts; the contract suite passes with it.

```sh
pnpm contracts:build
pnpm contracts:test
```

For the signed-account integration rehearsal, start devnet on port 5050 with three funded accounts, build the explicit test-asset feature, then run:

```sh
cd contracts/marketplace
scarb build --features fixtures
cd ../..
pnpm contracts:devnet
```

The script only accepts localhost devnet URLs. It deploys test assets, trades, checks live preflight and wallet authentication, and verifies rewind/replay. Evidence is written to ignored `.context/devnet-evidence.json`. Test assets have unrestricted minting and failure switches and are excluded from normal builds. Never deploy those assets publicly.

## Release preparation

Environment files are local-only; copy the reviewed `.example` templates for each
environment. Next.js does not automatically read `.env.frontend`: use the explicit
build/start commands in [operations](docs/OPERATIONS.md#release-procedure).

```sh
pnpm release:audit   # Registry advisory check; high/critical findings block release
pnpm release:check   # Reject local configuration and generated files in the release tree
pnpm release:verify  # SDK, backend, Cairo, lint, types, coverage, builds and browser smoke tests
```

The second command needs the pinned Cairo tools and Chromium described above.
It pins local fixture build settings, does not deploy contracts, and does not approve mainnet. Rebuild with reviewed deployment settings afterward.
Choose hosting and supply verified deployment inputs before executing the runbook.

## Verification and scope

```sh
pnpm backend:test
pnpm contracts:test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Browser tests use the built frontend and a local fixture backend. [The build plan](docs/BUILD-PLAN.md) is the authoritative feature list and acceptance tracker. Local tests and devnet transactions do not replace independent contract review, launch-collection compatibility checks, supported-wallet rehearsal, production backfill or a staging soak.

- [Contract design](docs/CONTRACT-SCOPE.md), [backend design](docs/BACKEND-SCOPE.md), [domain glossary](CONTEXT.md).
- [Operations and recovery](docs/OPERATIONS.md), [API contract](services/marketplace-backend/openapi.json).
- [Agent instructions](AGENTS.md).
- Historical [indexer assessment](docs/INDEXER-CURRENT-STATE-2026-10-06.md), [Arcade assessment](docs/CONTRACT-ASSESSMENT-2026-10-06.md) and [OpenSea comparison](docs/OPENSEA-COVERAGE.md).

## Railway deployment

Staging and production run on Railway. See [Railway setup](docs/RAILWAY.md) for
service configuration, isolated volumes, environment variables and deployment
steps. Run `pnpm railway:check` to validate both environment definitions locally.
