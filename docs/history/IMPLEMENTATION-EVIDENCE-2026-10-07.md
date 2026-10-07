# Historical implementation evidence

These dated observations record local work through 7 October 2026. Counts and
configuration may be superseded. Use [the build plan](../BUILD-PLAN.md) for current
status and [operations](../OPERATIONS.md) for deployment.

### First implementation batch

1. Create `contracts/marketplace` with pinned toolchain and native tests; establish approved dependency policy.
2. Commit machine-readable ABI/event fixtures and independent payment examples before UI integration.
3. Implement order creation/cancellation and direct getters test-first.
4. Implement one listing fill, then token/collection-offer acceptance with explicit payment bounds.
5. Add a minimal Node scanner and SQLite journal that decodes those events and survives duplicate input/restart.
6. Wire one existing token page to the new devnet flow and prove indexed convergence.

Do not begin by porting the old Torii infrastructure or implementing every API endpoint before the contract/event slice works.

### Implementation evidence — 6 October 2026

| Milestone | Current evidence | Remaining gate |
| --- | --- | --- |
| M0 | Confirmed pricing/royalty/admin defaults; version-1 ABI and reproducible class manifest checked in | Actual production fee/recipient/admin and final approved registry |
| M1 | Standalone Cairo implementation; 14 native tests including 256 accounting fuzz cases, authorization, royalty caps, pause/cancel, malicious reentry and late-cart rollback | Independent review and real launch-asset compatibility |
| M2 | Signed-account devnet listing/cart, token offer, collection offer and cancellation; native event decoder/index replay; direct preflight, metadata and wallet-signature verification | Supported browser-wallet rehearsal |
| M3 | Scanner, raw journal, per-source checkpoints, rewind, bounded metadata queue, filters/search/holdings/cursors; receipt-format and source-onboarding regressions | Full launch-registry historical backfill, fixed-checkpoint external reconciliation, dynamic game eligibility policies |
| M4 | 25-item account transaction succeeds on devnet; same-size repeated-fill comparison recorded | Mainnet-fork resource checks against actual launch assets |
| M5 | Retained UI wired to owned reads/writes; seller dashboard, offers, bulk actions, sweep, cart, transaction recovery, exact currency decimals; browser cart/portfolio smoke flows pass | Real wallet failure/recovery journeys on Sepolia |
| M6 | Statistics/floor history, bounded executable-bid evaluation, verified sessions, inbox, reports, moderation and operator refresh | Named moderation/operator policy and live operational rehearsal |
| M7 | Native backup/restore test, runtime dependency guard, pinned toolchain, CI jobs, Docker topology and runbook | Independent audit, representative HTTP/RPC load, production-size restore/failover, supported frontend wallet-library upgrade |
| M8 | No production deployment or legacy-order recreation performed | Sepolia rehearsal, migration/cancel decision, deployment inputs and seven-day soak |

Measured local evidence: signed devnet rehearsal indexed **55 orders and 54 NFTs**, then rewound/replayed order, ownership, floor and daily-stat projections identically. A 25-item native cart used **100,088,320 L2 gas units** versus **108,655,360** for 25 single fills in one account multicall (about 7.9% lower in these fixtures); both used 5,376 L1 data-gas units. These receipts include account execution, use test assets and are not a mainnet fee estimate.

A synthetic in-memory catalog with 10,000 NFTs and 2,000 listings initially exposed a 32.6-second query. Composite indexes reduced mixed-query p95 to **38.3 ms over 100 queries** on this machine. This is SQL timing, not the planned 50-requests/second HTTP or real-RPC capacity test. Scripts reproduce the measurements; local evidence is in ignored `.context/`.

Current validation: **500 frontend tests**, **32 native backend tests** (also passing from a temporary tree without `node_modules`), **14 Cairo tests** including 256 fuzz cases, and **4 browser smoke tests** pass. Frontend coverage is 70.6% statements/lines, above the unchanged 70% gate. Lint, strict typecheck, frozen-lockfile installation and production Next.js build pass. The optional screenshot-only test is skipped when no routes are requested; remote CI has not been run.

Production deployment is intentionally unconfigured. The remaining gates above are not completed by fixture tests, code review by the implementer, or a successful frontend build.

### Interaction review — 7 October 2026

Reviewed wallet connection and retry, network/provider selection, offer confirmation, report submission, notifications, cart and portfolio navigation. Fixed premature connection-modal dismissal (`connectAsync` now awaited), missing rejection feedback and missing-extension guidance; restored connection persistence; bound application RPC to the configured known network and passed the network hint to Controller. Controller retains its own wallet transport: configuring this SDK with a custom RPC triggers synchronous network access during construction and can break the page during an outage.

Offer previews now invalidate when the NFT, wallet, order or deployment changes, clear on failed refresh, and block duplicate checks. Reports block duplicate submission while pending. Notification read failures are visible and retryable.

Validation: 507 frontend tests, strict typecheck, lint, production build and four browser smoke flows pass. Browser inspection confirmed the missing-Braavos message and that Controller opens its login interface; no account login, signature or live transaction was performed. Ready/Braavos connection approval, actual reconnect/network switching, and authenticated wallet trading still require installed-wallet rehearsal. These fixes remain local until committed.

### Storybook integration — 7 October 2026

Storybook 10.6.1 with the Next.js/Vite framework is integrated at `http://localhost:6006`. The current catalog contains **47 stories** covering existing visual tokens, typography, controls, dialogs/keyboard focus, wallet states, carts, order entry, offer review/funding and transaction feedback. Stories use production components with explicit Storybook-only wallet/preflight fixtures. The formal brand guideline and exhaustive journey coverage remain follow-up work.

Vitest was upgraded to the locked 4.1.11 release with separate `unit` and Chromium `storybook` projects. **524 unit/integration tests plus 47 story tests pass**, including automated accessibility checks. An unnamed-button probe confirmed accessibility failures block tests; the probe was removed. Combined coverage retains all four 70% gates (80.37% statements, 70.23% branches, 81.28% functions, 81.70% lines). Four full-app browser flows, typecheck, lint, Storybook's static build, the marketplace production build and Storybook's doctor check pass locally; remote CI has not been run for these changes.

The app and Storybook share font-loader configuration and explicit semantic font bindings; this fixes system-font fallback, including Storybook's unquoted numeric font-family name. Typography stories assert the intended font families. CI installs Chromium before combined coverage and uploads the static workbench. See [Storybook workflow](../STORYBOOK.md) for setup, fixture boundaries and how to extend the catalog. These integration changes remain local until committed.

### UI/UX review fixes — 7 October 2026

Addressed all eight findings from the local browser review. The mobile header keeps wallet/cart actions visible and gives search a separate row. A shared wallet chooser now opens from cart, order entry, notifications and the trader dashboard; connection preserves terms and cart items and never submits a trade automatically. Collection filters use a mobile/tablet drawer, the banner is shorter, and statistics are collapsible. Home and NFT cards show currency-labelled prices; search cards consume their indexed best listing. Token detail has one primary purchase action, and card bodies navigate to details. Activity shows available amounts, participants and network-specific transaction links. Public status at `/ops` uses readable explanations; authenticated operator controls moved to `/operator`. Public profiles distinguish the viewed wallet from the connected wallet.

Stories were authored for the changed components, with responsive browser inspection before integration. Validation: **524 unit/integration tests + 64 Storybook tests (588 total)**, accessibility checks, four production-browser smoke flows, strict typecheck, lint, static Storybook build and production Next.js build pass locally. Combined coverage is 82.49% statements, 72.02% branches, 81.26% functions and 83.55% lines, above unchanged 70% gates. The optional screenshot-only smoke test remains skipped when no routes are selected. Local runs used an installed Chromium executable via `CHROMIUM_EXECUTABLE_PATH` after the default browser download hit disk limits; CI keeps the default pinned Playwright installation.

Integrated core routes were inspected at 320, 390, 768, 1024 and 1440px without document overflow. At 390px, the first collection NFT moved from approximately 1,388px to 742px down the page. Live demo checks confirmed URL-preserving filters, search prices and wallet chooser dismissal returning to an intact cart after a missing-extension error. Component connection/transaction outcomes are simulated; actual wallet signatures, authenticated trading and production settlement remain separate launch gates. Changes remain local until committed.

### SDK extraction validation — 7 October 2026

Private `@biblio/marketplace` and `@biblio/marketplace-react` 0.1.0 workspace packages now expose ESM, TypeScript declarations and generated ABI assets. The former uses TanStack Query Core; the latter uses React Query. The main app imports their public exports through presentation/wallet compatibility adapters. HTTP transport, domain types, call construction, cart constraints, order preparation, authentication verification and transaction coordination have a package implementation rather than parallel implementations inside UI components. The indexer remains a separately deployed, dependency-free Node service.

**23 SDK/React interface tests pass**, covering cache and currency isolation, cancellation, structured errors, API/network mismatch, exact approvals, cart constraints, immutable reviewed plans, account/fee changes, ambiguous submissions, storage failure, configuration-outage recovery and endpoint-relative cached assets. Packed artifacts were extracted into an isolated consumer outside the repository, where Node and React SSR imports and TypeScript declarations passed without app aliases or repository source imports. The runnable Node example also read the local demo API.

**525 app unit/integration tests and 66 Storybook tests pass (591 total)**. Existing app coverage gates remain unchanged: statements 82.17%, branches 71.32%, functions 81.07%, lines 83.08%. These percentages cover the app; the native SDK interface tests are reported separately. Typecheck, lint, production Next.js build, static Storybook build and four production-browser smoke flows pass. The optional screenshot-only test is skipped without selected routes. Integration/SDK consumer stories were visually checked at 390, 768 and 1440px with isolated clients and no horizontal overflow.

The extended signed-account devnet rehearsal used the public SDK against the real HTTP API and Cairo contracts for listing/buy, token offer/acceptance, collection offer/acceptance, cancellation and repricing. Each transaction reached indexed reflection, a React consumer read the indexed owner, and rewind/replay reproduced the final projection. Recovery can query receipts using the pinned deployment even when the config endpoint is unavailable. This is local devnet evidence, not supported browser-wallet or production sign-off.

Local dependency files were restored with a clean frozen-lockfile installation after a concurrent cleanup was stopped. CI now includes SDK interface and packed-consumer checks; remote CI has not been run for this work. Packages remain private and unpublished, and changes remain uncommitted.

### Contract-to-SDK parity — 7 October 2026

Audited the Cairo `IMarketplace` interface and checked-in ABI against SDK exports. All **17 public entrypoints** now have callable SDK interfaces, with a parity table in the SDK README and a machine-readable `CONTRACT_CAPABILITIES` inventory. CI tests compare interface names, public exports, the contract source manifest and supported ABI fingerprint; future ABI changes require explicit SDK review.

Added direct RPC `get_order`, `get_config` and `quote_terms` reads with lossless decoding, TanStack query options, pinned block support and an injected reader/network check. Added native `buy_listing`, `cancel_orders`, all five governance operations, constructor calldata validation, React read/admin hooks, exact base-unit royalty caps and full-width u64 expiry/nonce handling. Native multi-order cancellation is used by `prepareCancel`; the default cart path keeps `buy_many` and its caller deadline. Fees remain immutable, and missing contract methods such as a pending-admin getter or upgrade action are not invented in the SDK.

Cancellation can use on-chain config during indexer outages. Governance plans are explicit, immutable, account/deployment-bound and revalidated against the current administrator; they remain available while paused. Confirmed cancellations and governance do not retain a submission lock solely because indexing is delayed. Repeat cancellation with no new market event is reported as accepted on-chain without a false claim of index reflection.

The audit exposed and fixed two supporting indexer gaps: canonical governance events now count toward transaction reflection, and admin transfer clears the pending nominee projection with rewind restoration tested. The devnet rehearsal now exercises native single buys, batch cancellation while paused, idempotent cancellation, direct reads/royalty snapshot distinctions, collection/currency policy toggles, pause/unpause, and two-step admin transfer and restoration. Every contract entrypoint was exercised; rewind/replay compares configuration and policy projections as well as orders, owners, volume and floor history.

Validation: 40 SDK/React interface tests and 34 native backend tests pass, including ABI drift, malformed RPC responses, role changes, offline cancellation and disabled/incomplete React query inputs and immutable read-query parameter snapshots. The existing 591 app/Storybook tests pass. Direct read hooks and governance actions add no new marketplace UI. SDK packages remain private/unpublished and changes uncommitted; independent audit, real supported-wallet rehearsal and production launch gates remain unchanged.


### Asset space and spacing review — 7 October 2026

Implemented shared 16/24px page insets across home, search, token detail, profile,
portfolio and trader views; removed nested token-detail padding and duplicate
main landmarks. Collection banners now use 128/160px minimum heights, the trait
sidebar is 208px, and asset columns respond to available content width. Cards
remove the inherited 24px action gap and preserve readable, wrapping 44px actions.
Spacing conventions and the two asset-layout stories are documented in
[Storybook](../STORYBOOK.md#marketplace-spacing).

Local evidence: 525 unit tests and 68 Storybook interaction/accessibility tests
passed. Component responsive checks covered 320–1920px, including 639/640px and
1279/1280px breakpoints. The demo collection route was checked at 320, 390, 768,
1024, 1280, 1440 and 1920px with no horizontal overflow. At 1440px, the first
asset moved from y=612 to y=548 and its width increased from 207px to 219px;
at 390px the first asset moved from y=742 to y=693. Density/list switching,
filter drawer dismissal, cart addition and token navigation were exercised.
These are local fixture/browser observations, not real-wallet trading evidence.

Final typecheck, lint, Next production build and Storybook build passed. Home,
token detail, portfolio entry and disconnected trader entry were checked at
390/768/1440px with no page overflow. The local preview on port 3001 serves the
production build: a clean Turbopack dev restart exposed an existing Google-font
resolution failure, which remains a development-environment follow-up.

### Collection-navigation performance pass — 7 October 2026

Removed the global 256px collection rail and mobile collection drawer. A plain
server-renderable `MarketplaceLayout` now gives routes the available width;
collection discovery lives at `/#collections` and in the existing header search.
Trait filters remain local to the collection page. Removed the obsolete rail,
drawer, thumbnail-query hook and their retired tests/types.

Reference: the live [OpenSea Azuki page](https://opensea.io/collection/azuki)
separates compact global navigation/search from collection-specific filtering.
We adopted that separation while explicitly removing our collection rail rather
than copying OpenSea's global icon rail or its unrelated trading features.

Storybook `Marketplace/Full width navigation` covers desktop/mobile shells,
collection-discovery links and keyboard progression into search. Browser checks
covered 320, 390, 639, 640, 768, 1023, 1024, 1279, 1280, 1440 and 1920px without
horizontal overflow. Unit regression prevents the shell from fetching market
data. All 503 remaining unit tests and 9 affected header/layout stories passed.

App verification: collection views at 320/390/768/1024/1280/1440/1920px had no
horizontal overflow. At 1440px the default grid increased from four to five
columns; at 390px the first asset moved from y=693 to y=652. A token-detail
request trace no longer included the collection-list request or the two
thumbnail-fallback token requests observed before. This is a specific request
reduction, not a claimed Lighthouse/Core Web Vitals improvement. Header discovery
and search navigation were checked against the real app. Typecheck, lint,
Storybook build and Next production build passed; localhost:3001 serves the
updated production preview.
