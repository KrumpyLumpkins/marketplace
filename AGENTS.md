# Working in this repository

## Direction and sources of truth

Keep the existing UI. Build standalone Cairo settlement and an owned Node.js indexer/API, with on-chain ERC-721 orders and atomic carts. The new paths are implemented locally; dated Arcade assessments are historical migration input. Consult the build plan for remaining validation and launch gates.

- Before implementation or scope changes, read [the build plan](docs/BUILD-PLAN.md). It owns launch scope, milestones, dependencies and acceptance gates.
- For order types, calldata, events, fees, royalties or permissions, read [contract design](docs/CONTRACT-SCOPE.md) and the relevant [architecture decision](docs/adr/0001-standalone-cairo-marketplace.md).
- For indexing, storage, queries, metadata, authentication or recovery, read [backend design](docs/BACKEND-SCOPE.md).
- For reusable reads or trading workflows, read [SDK integration](packages/marketplace-sdk/README.md) and [React bindings](packages/marketplace-react/README.md). Consumers use public package exports; keep protocol rules out of app components.
- Before adding or changing UI, read [the Storybook guide](docs/STORYBOOK.md) for story authoring, fixtures and verification commands.
- For domain terminology, consult [the glossary](CONTEXT.md). Keep it free of implementation instructions.
- For running the app, use [README.md](README.md). Before release preparation or deployment, read [operations](docs/OPERATIONS.md) and the [on-chain sequence](docs/MAINNET-DEPLOYMENT.md); `pnpm release:verify` runs local gates, while the build plan owns outstanding launch approval.
- Read dated assessments and the OpenSea comparison only when investigating legacy behavior or the rationale for a decision. They are evidence, not active implementation plans. Archived implementation reports live in `docs/history/`. `.context/README.md` indexes ignored local evidence and tooling; neither archive is an active specification.

The build plan takes precedence over supporting scope documents. Preserve unresolved fee, royalty, administration and deployment choices as explicit decisions; do not turn a proposed default into a production guarantee. Update the canonical document when a decision changes instead of creating a competing PRD.

## Implementation rules

- Preserve shadcn/ui primitives, Tailwind tokens, accessibility and URL-based discovery state. Put reusable fetching and trading rules in `packages/marketplace-sdk`, React bindings in `packages/marketplace-react`, and app presentation/adapters in `src/features` or `src/lib`; routes orchestrate them.
- Keep strict types. Backend indexing and protocol code use local modules and Node built-ins. PostgreSQL access uses the maintained `pg` driver, explicitly approved on 8 October 2026; keep other runtime dependencies scoped and justified. Existing frontend dependencies and Cairo development/security primitives have separate policies in the plan.
- Use our contract ABI and explicit events for new-market trading. Torii, Dojo World storage and Arcade trading SDK logic belong only to explicitly scoped legacy compatibility work.
- Implement behavior changes test-first: demonstrate the failure, implement the smallest correction, then refactor. Test public behavior and invariants rather than mirroring implementation details.
- Keep chain values lossless and order identity deployment-aware. Derive payment bounds from contract terms; preflight is advisory, while the contract enforces authorization and settlement.
- Preserve single-currency, maximum-25-item, all-or-nothing checkout and visible per-item errors. Distinguish submission, chain acceptance/reversion and index reflection. Migrate persisted cart identities deliberately.
- Keep chain-derived data rebuildable and user-owned application data durable. Advance index checkpoints atomically with projections; report freshness for the sources actually used.

## Storybook-first UI workflow

For every feature that adds or changes UI, complete these steps in order. Backend-only changes follow the applicable validation rules below.

1. Create or update component stories before integrating the UI into site routes. Develop the actual reusable production components in Storybook, using isolated fixtures. Cover relevant default, loading, empty, error, disabled and success states, plus wallet and transaction states where applicable.
2. Verify the stories in a real browser at mobile, tablet and desktop sizes, including widths around relevant layout breakpoints. Check text wrapping, overflow, touch targets, navigation and any dialogs or menus. Exercise keyboard navigation and focus behavior as well as pointer interactions.
3. Run the relevant story interaction and accessibility tests and build Storybook. Fix interaction, accessibility and responsive layout failures before site integration. Passing automated tests alone does not establish responsive visual correctness.
4. Integrate the same verified components into the site, then check the affected routes and user journeys with their real application wiring and responsive layouts. Story fixtures do not replace application integration or real-wallet validation.

Delivery reports must identify the stories and viewport sizes checked, the interactions verified and any remaining coverage gaps.

## Validation and delivery

Use pnpm for the existing frontend; `pnpm-lock.yaml` is canonical. Check `package.json` and `.github/workflows/ci.yml` for current scripts/runtime. Pin new backend and Cairo tooling when those packages are introduced; do not report planned commands or tests as already available.

- Frontend logic: relevant tests, typecheck and lint; rendering/routes additionally need a build and relevant browser flows.
- Contract changes: unit/invariant tests plus appropriate adversarial, fork and resource checks from the contract scope.
- Indexer/API changes: native Node tests, database/replay or HTTP integration checks appropriate to the changed behavior.
- Documentation-only changes: verify links, scope consistency and `git diff --check`; application tests may be skipped with that limitation stated.

Report what changed, verification results and any unresolved blocker. Keep implementation status in the build plan accurate; source inspection, mocked tests, replay and production validation are distinct evidence.

## Workspace and Git

Inspect the current branch and working tree before editing. Preserve unrelated work and continue a suitable active branch; use `codex/` for a new branch. Do not switch/reset the checkout merely to follow a boilerplate workflow.

Use conventional commit subjects when committing. Stage explicit paths; run `pnpm release:check` before publishing. Environment files stay local; only `.env.*.example` templates belong in Git. Keep scratch sources, caches, generated artifacts and credentials out of commits. Store local investigation material in ignored `.context/`; promote only reviewed, necessary evidence into documentation. Infrastructure deployment, contract migration and user transactions must follow the applicable milestone gates and user authorization.
