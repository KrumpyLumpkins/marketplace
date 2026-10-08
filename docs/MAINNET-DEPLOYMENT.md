# Marketplace mainnet deployment

These scripts prepare and execute the existing immutable v1 contract. They do
not deploy infrastructure, create accounts, transfer funding, or place trades.
[The build plan](BUILD-PLAN.md) owns launch approval; [operations](OPERATIONS.md)
owns backend, frontend and recovery procedures. A paused mainnet bootstrap is recorded in
[deployment.mainnet.json](../config/marketplace/deployment.mainnet.json). Trading
was subsequently activated at block 16060941 after reconciliation and explicit
user approval to waive the remaining launch gates. The
[activation record](evidence/mainnet-activation-2026-10-08.json) preserves the receipt,
public API readiness and uncompleted checks. The standard procedure below remains
the reference for future deployments; the recorded exception is not a passed audit
or wallet rehearsal.

## Sequence and authority

| Step | Signer | Result |
| --- | --- | --- |
| Probe / plan | None | Observed identities, verified artifacts, deterministic address and reviewed calls |
| Declare | Funded deployer | Publishes the reviewed Sierra class; reuses it if already declared |
| Deploy | Same deployer | UDC instance with the **final administrator in the constructor** |
| Configure | Final administrator / multisig | One atomic multicall: pause first, then enable the approved currencies and collections |
| Verify / export | None | Canonical receipts, current configuration/policies and indexer/frontend handoff files |
| Backfill / reconcile / rehearse | Operators and test wallets | Deployment-specific operational evidence |
| Activate | Final administrator / multisig | A separately approved `set_paused(false)` transaction |

The constructor defaults to unpaused, but both allowlists start empty. No trading
is possible between deployment and configuration. The configuration transaction
pauses before enabling any asset, and leaves the market paused. The deployer
receives no temporary administrative role when distinct from the final multisig.

The recommended signing arrangement is a dedicated deployer plus the final
multisig administrator. The same wallet may fill both roles if deliberately
chosen in the plan. Standard Cairo 1 account multicalls are required. Stark-signature accounts can use an environment key;
hardware/custom accounts use an approved local signer module. Existing multisigs
can sign exported calls through their own interface; the scripts never pretend
a single key represents a multisig. Legacy Cairo 0 execute encoding and nonstandard
multisig proposal/execution wrappers are not supported by receipt verification;
use an account whose final on-chain invoke contains the standard reviewed multicall.

## 1. Prepare reviewed inputs

Use Node 22.22.0, pnpm 10.8.1 and Scarb 2.15.1. Install with a frozen lockfile.
Before mainnet broadcast, resolve `pnpm release:audit`, run `pnpm release:verify`,
complete independent review and public Sepolia rehearsal, and commit the reviewed
release. Mainnet sends reject a dirty checkout or a different commit from the plan.

```sh
mkdir -p .context/deployments/mainnet
cp config/marketplace/deployment.mainnet.example.json .context/deployments/mainnet/config.json
cp .env.deployment.example .env.deployment
```

Fill `.env.deployment` locally. It is ignored by Git. Keep RPC credentials and
signing keys out of JSON plans, command arguments, screenshots and commits.
`DEPLOYMENT_RPC_URL` must use HTTPS on mainnet and support historical state at
accepted block hashes. The tooling reuses the pinned Starknet.js 10.8.0 development
alias; the native backend gains no runtime dependency.

Fill `config.json` with the intended deployer/admin addresses and their class
hashes, initial fee recipient/rate (0–500 bps), a fixed salt, UDC class hash,
explicit maximum fee in **FRI** per transaction, and reviewed asset lists.
There is deliberately no default fee, admin address, fee cap or asset approval.

The initial NFT approval is **Realms only**, confirmed 8 October 2026. Use the
address/start block from `registry.realms.json` as investigation inputs; verify them
and supply its class hash and compatibility evidence before filling the single
collection row. Payment currencies remain a separate release choice.

Collection rows:

```json
{"address":"REVIEWED_NFT_ADDRESS","classHash":"REVIEWED_CLASS_HASH","name":"Collection name","startBlock":0,"royalties":true,"review":"asset compatibility report reference"}
```

Currency rows:

```json
{"address":"REVIEWED_ERC20_ADDRESS","classHash":"REVIEWED_CLASS_HASH","symbol":"TOKEN","decimals":18,"review":"token compatibility report reference"}
```

Replace every placeholder. `startBlock` is the collection's earliest required
historical block, not the marketplace's deployment block. Maximum 24 assets
keeps configuration within 25 calls. Do not copy the candidate registry as an
approval list. Collection offers are for any qualifying token in the collection;
health/trait restrictions are not encoded by this v1 contract.

`release` contains references to the reviewed contract audit, asset compatibility
matrix, public Sepolia rehearsal and human release approval. References are an
audit trail, **not machine verification of those reports**. Mainnet sends require
all four; the bootstrap decision records internal/local evidence and the explicitly uncompleted independent/public acceptance checks. It is not approval to activate trading.

## 2. Probe identities and freeze a plan

`probe` is read-only, accepts the addresses from an incomplete config, and writes
class hashes at one observed block. Review them independently before copying them
into the config; RPC observations do not certify contract safety.

```sh
node --env-file=.env.deployment scripts/deployment/cli.mjs probe --config .context/deployments/mainnet/config.json --out .context/deployments/mainnet/observed.json
pnpm contracts:deploy plan --config .context/deployments/mainnet/config.json --out .context/deployments/mainnet/plan.json
node --env-file=.env.deployment scripts/deployment/cli.mjs inspect --plan .context/deployments/mainnet/plan.json
```

`plan` runs a normal non-fixture Cairo build and compares production source, ABI,
Sierra hash and CASM hash against the checked-in manifest. It derives a unique
UDC address bound to deployer, salt, class and constructor terms, then freezes the
plan with a SHA-256 `planId`. It refuses to overwrite an existing file. An artifact
mismatch requires review and a new manifest; deployment tooling never refreshes
or blesses a manifest automatically.

Review the administrator, fee terms, asset classes, history start blocks, fee
ceiling, constructor calldata and all calls. Copy the printed digest into your
local shell only after review:

```sh
export DEPLOYMENT_PLAN_ID='REVIEWED_PLAN_DIGEST'
```

The digest binds the exact plan, not a blanket authorization for later changes.
Do not edit a frozen plan. Choose a new directory/plan if deployment terms change.

## 3. Declare, confirm, deploy, confirm

Configure the **deployer** signer in `.env.deployment`. Use an already deployed,
funded account. The scripts do not move funds or deploy a new account.

```sh
node --env-file=.env.deployment scripts/deployment/cli.mjs send --plan .context/deployments/mainnet/plan.json --step declare --approve "$DEPLOYMENT_PLAN_ID"
node --env-file=.env.deployment scripts/deployment/cli.mjs confirm --plan .context/deployments/mainnet/plan.json --step declare
node --env-file=.env.deployment scripts/deployment/cli.mjs send --plan .context/deployments/mainnet/plan.json --step deploy --approve "$DEPLOYMENT_PLAN_ID"
node --env-file=.env.deployment scripts/deployment/cli.mjs confirm --plan .context/deployments/mainnet/plan.json --step deploy
```

`send` estimates V3 resource bounds, requires their total maximum charge to stay
within `maxFeeFri`, and fixes the tip to zero. It rechecks network and class
identities and writes a durable intent before submitting the real transaction.
Estimation may request simulation signatures from the account adapter. `confirm` requires an
accepted, successful, canonical receipt, checks sender/version/fee bounds, exact Cairo 1 account calldata and
constructor events/state, and records the actual deployment block. Pending
receipts are not completion: rerun `confirm`, not `send`.

## 4. Configure using the final administrator

Export the actual wallet-call array for the multisig's transaction interface:

```sh
pnpm contracts:deploy calls --plan .context/deployments/mainnet/plan.json --step configure --out .context/deployments/mainnet/configure.calls.json
```

Import the file's `calls` array using the multisig tool's supported format.
The wrapper is a review document, not a vendor-specific multisig file format.
Sign all calls **in the displayed order as one atomic transaction**, using V3,
zero tip and a resource-bound maximum within the reviewed cap. After submission:

```sh
node --env-file=.env.deployment scripts/deployment/cli.mjs confirm --plan .context/deployments/mainnet/plan.json --step configure --hash ADMIN_TRANSACTION_HASH
```

Alternatively an approved administrator signer module/account may run `send
--step configure --approve "$DEPLOYMENT_PLAN_ID"`, followed by `confirm`. Do not
supply the deployer key for an administrator-only step. Custom signer modules
export `createAccount({provider,address,chainId})` returning the supported account
interface with `address`, `estimateDeclareFee`, `estimateInvokeFee`, `declare`
and `execute`; they are trusted executable local code, not downloaded plugins.

## 5. Verify and hand off while paused

Continue with the [indexer launch stages](BUILD-PLAN.md#10-launch-sequence-indexer-rollout-and-migration)
and [native bootstrap sequence](OPERATIONS.md#indexer-rollout-order) before activation.
The indexer needs a fresh deployment-bound DB, full NFT history, fixed-block
reconciliation, metadata coverage and live catch-up; exporting a registry alone
is not indexer rollout completion.

```sh
node --env-file=.env.deployment scripts/deployment/cli.mjs verify --plan .context/deployments/mainnet/plan.json
node --env-file=.env.deployment scripts/deployment/cli.mjs export --plan .context/deployments/mainnet/plan.json --out-dir .context/deployments/mainnet/handoff-paused
```

Verification checks canonical deployment/configuration receipts, current class
identities and administrator/fee/pause state, and replays policy events through a
pinned head. Missing or unexpectedly enabled assets fail verification. This is a
specific contract-policy check, not full NFT/order backfill reconciliation.

Exports are `deployment.json`, a deployment-specific `registry.json`, and frontend
and backend environment templates. RPC URLs, operator secrets, public origin and
hosting values remain blank for the operator to supply. Files are never written
into the live registry or live environment. Keep the plan, journal and export as
release evidence. Follow [operations](OPERATIONS.md) to backfill a new chain DB,
preserve application state, reconcile asset ownership, start workers, configure
HTTPS and verify wallet/account behavior. The backend can be live while trading
readiness correctly remains false because the contract is paused.

## 6. Approve activation separately

After reconciliation and the required wallet/operational rehearsal, copy
`config/marketplace/deployment.activation.example.json` to a local approval file.
Set its `planId` to the original plan's digest and add references for
`indexerReconciliation`, `walletSmoke` and `activationApproval`. This keeps later
approval separate without editing the frozen deployment terms.

```sh
pnpm contracts:deploy calls --plan .context/deployments/mainnet/plan.json --step activate --activation-evidence .context/deployments/mainnet/activation.json --out .context/deployments/mainnet/activate.calls.json
```

Review and sign the sole `set_paused(false)` call in the existing multisig. Record
its hash and approval evidence:

```sh
node --env-file=.env.deployment scripts/deployment/cli.mjs confirm --plan .context/deployments/mainnet/plan.json --step activate --hash ACTIVATION_TRANSACTION_HASH --activation-evidence .context/deployments/mainnet/activation.json
node --env-file=.env.deployment scripts/deployment/cli.mjs verify --plan .context/deployments/mainnet/plan.json
node --env-file=.env.deployment scripts/deployment/cli.mjs export --plan .context/deployments/mainnet/plan.json --out-dir .context/deployments/mainnet/handoff-active
```

An approved administrator adapter may instead run `send --step activate`, adding
both `--approve "$DEPLOYMENT_PLAN_ID"` and `--activation-evidence FILE`. It requires
the paused configuration to verify first. Exported call files expose missing
release evidence but cannot enforce what a separate wallet signs. Recording a
hash is an observation of chain state, not retrospective release authorization.

## Recovery

State is stored in `state.json` beside the plan, protected by an exclusive lock
and durable writes. Re-running a confirmed send does not submit another transaction.
A pre-submit record without a returned hash means **unknown outcome**. Locate the
transaction through the account/wallet and reconcile with `confirm --step STEP
--hash KNOWN_HASH`; sender, nonce (when recorded), receipt and effects are checked.
Never clear an ambiguous record merely because an RPC request timed out.

A canonically reverted transaction may be explicitly cleared with
`reset-reverted --plan FILE --step STEP` before a fresh approved send. This retains
its history. A pending, successful, orphaned or unknown transaction cannot use
that reset. A stale `.lock` file requires confirming no process is running before
manual removal. A genuinely never-submitted intent without a hash needs operator
nonce/transaction reconciliation; there is deliberately no blind “force retry”.

If an address already exists without this journal's deployment record, provide
its original deployment hash and verify it. Do not automatically switch salt or
accept an arbitrary matching address. Contracts remain cancellable when paused;
there is no upgrade or deployment rollback command.

## Local evidence and limits

`pnpm contracts:deploy:test` exercises validation, fee bounds, identity changes,
ambiguous submission, canonical receipt checks and journal recovery.

For a signed local rehearsal, start devnet **0.10.0** with three accounts and full
historical state, then run `pnpm contracts:deploy:rehearse`:

```sh
starknet-devnet --seed 42 --accounts 3 --state-archive-capacity full --port 5050
```

The rehearsal accepts only localhost, creates throwaway fixture assets, uses
separate deployer/admin accounts, and exercises the real CLI through active and
paused handoff exports. `SN_SEPOLIA` is devnet's chain ID; this does **not** claim
public Sepolia or mainnet validation. No actual mainnet transaction was sent while
building these scripts. RPCs are trusted observation sources; a class pin is a
point-in-time check and cannot prevent an asset administrator upgrading later.

Primary references: [Starknet.js 10.8 deployment](https://starknet-js.com/docs/10.8.0/guides/contracts/create_contract/)
and [OpenZeppelin's UDC address/interface](https://docs.openzeppelin.com/contracts-cairo/3.x/udc).

## Configure the local signer interactively

Run `pnpm contracts:env` from the repository root. It prompts without echo for
`DEPLOYMENT_RPC_URL`, `DEPLOYMENT_SIGNER_ADDRESS` and
`DEPLOYMENT_SIGNER_PRIVATE_KEY`, then atomically saves ignored `.env.deployment`
with mode `600`. Blank responses retain existing values; supplying a private key
switches from an optional signer module to private-key signing. This configures
an existing funded account; it does not create/fund an account or submit a
transaction. Keep this file local. The Railway API/indexer requires no signing
key. Probe identities and complete the deployment plan/gates before using it.

## Fee administration after deployment

The administrator can use SDK `contract.admin.prepareSetFee(account, feeBps, recipient)`
and `contract.admin.submit`, or export `buildSetFee(marketplace, feeBps, recipient)`
for an administrator wallet. This atomically changes the new-order rate and the
recipient for all future fills. The hard ceiling remains 500 bps; recipient must
be nonzero. It works while paused and emits `FeePolicyChanged`. Existing orders
retain their fee rate. New order calls must supply `max_fee_bps`.

The deployment plan binds the **initial** fee terms. Deployment verification and
activation continue to require those reviewed terms; an unexpected fee change
during rollout fails verification. Routine post-launch fee administration is
separate from that initial deployment attestation.

This ABI revision adds one felt to order terms and one argument to creation.
Regenerate/review class and ABI hashes and build the matching SDK/indexer before
deployment. There is no mainnet marketplace to migrate yet. Old local fixture
plans/databases must not be reused with the revised class.
