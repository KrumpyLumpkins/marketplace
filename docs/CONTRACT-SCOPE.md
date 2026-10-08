# Standalone Starknet marketplace — contract scope

[BUILD-PLAN.md](./BUILD-PLAN.md) owns launch scope and delivery gates. This document defines the contract design for that plan, including one-shot collection offers. The user confirmed the economic and administration defaults on 6 October 2026; production addresses and fee rate remain deployment inputs.

Version 0.3 · 8 October 2026

Status: implemented locally under `contracts/marketplace`, with ABI and artifact manifest. This design is not an assertion of audited safety or production deployment.

Product benchmark: OpenSea-style NFT trading. The [coverage assessment](./OPENSEA-COVERAGE.md) records the rationale for the launch expansion; the build plan is authoritative.

## 1. Confirmed direction

- Keep the existing marketplace UI and build our own Node.js indexer.
- Rebuild the trading contracts in Cairo without Dojo, World storage or Cartridge marketplace SDK dependence.
- Create orders on-chain in v1.
- Support ERC-721 fixed-price listings, token-specific and one-shot collection offers, and a maximum-25-item atomic cart in one currency, as scoped by the build plan.
- Optimize for measured Starknet trading costs and reliable settlement.

The [architecture decision](./adr/0001-standalone-cairo-marketplace.md) records the user's selection. Domain terms are in [CONTEXT.md](../CONTEXT.md). This supersedes the retained-Arcade assumptions in the earlier assessments.

## 2. First principles

1. **Only the maker can authorize an order.** An API response, token callback or fee recipient cannot do so.
2. **Every economic term is bounded by contract checks.** Neither the taker nor an administrator can add an uncommitted surcharge to an existing order.
3. **One NFT trades once per order.** State transitions are terminal and guarded against callback reentrancy.
4. **The index is advisory.** A stale or malicious backend cannot bypass ownership, payment, expiry or order-state checks on-chain.
5. **An atomic cart is all or nothing.** No partial-success settlement, hidden retries or sequential fallback.
6. **Makers retain an exit.** Cancellation works while trading is paused or an asset/currency is disabled.
7. **Product reads are reproducible.** Explicit events and ordinary NFT transfer history reconstruct marketplace state without private vendor data.
8. **Optimization preserves these guarantees.** Faster code with weaker authorization, precision or recovery is not an acceptable trade.

## 3. Small initial shape

One settlement contract per chain/deployment version. Internal modules handle order storage, settlement accounting, NFT/payment dispatch, and limited administration. No shared World, matching engine, router mesh, plugin execution, delegate-call extensions, or escrow balance ledger.

The contract does not custody assets between transactions. NFTs stay with sellers; offer funds stay with buyers. A fill transfers payments and the NFT atomically. The backend discovers candidate matches; it never decides whether a fill is permitted.

Recommended launch constraints: approved ERC-721 collections and ordinary, tested ERC-20 currencies. Preserve STRK/LORDS/SURVIVO UI support where their exact deployed contracts pass compatibility checks. Rebasing, transfer-tax, callback-heavy or otherwise incompatible payment tokens are not accepted through a generic arbitrary-address path.

The user's zero-third-party-runtime-package requirement applies to the Node backend. For Cairo, propose narrowly scoped, pinned standard token interfaces and reviewed security primitives where they reduce risk; no Dojo dependency and no copy of Arcade business logic. Exact Cairo/Scarb/Foundry and primitive versions are chosen together in the implementation spike. New protocol design does not mean inventing cryptography or NFT standards.

## 4. Order model and lifecycle

Order key: `(maker, maker_nonce)` within a marketplace deployment. A maker's monotonic nonce is allocated on creation and never reused. External identity is `(chain, marketplace_address, maker, maker_nonce)`. This avoids a global order-allocation counter; whether it materially affects execution throughput must be measured.

| Immutable term | Meaning |
| --- | --- |
| kind | Listing, token-specific offer or one-shot collection offer |
| maker | Authenticated creator, taken from the immediate caller |
| collection, token_id | Exact ERC-721 collection; uint256 token ID for listings/token offers, explicitly absent for collection offers |
| currency | Exact approved ERC-20 address |
| buyer_debit | Exact total ERC-20 payment for the trade, uint256 in the reference design |
| expiry | Chain timestamp after which the order cannot fill |
| fee_bps | Protocol fee rate snapshotted at creation, bounded by maker consent |
| royalty policy | Fixed amount/recipient for token-specific orders; committed maximum amount and bounded fill-time resolution for collection offers |

The administrator can atomically update the current fee rate and recipient with `set_fee`, within the hard 500-bps ceiling. Each order snapshots its fee rate on creation; later rate changes apply only to new orders. The fee recipient is resolved at fill, including for older orders. Creation takes `max_fee_bps` and reverts if the current rate exceeds that reviewed limit; a lower rate is accepted. Token-specific seller proceeds derive from stored terms; collection-offer proceeds additionally use the bounded royalty for the delivered NFT. Store terminal state separately from immutable terms so fill/cancel avoids rewriting the complete order.

State: `Open → Filled` or `Open → Cancelled`. Expired is derived when chain time is greater than or equal to expiry; it needs no keeper write. Expiry must be in the future when created, with no arbitrary eight-hour minimum. An expired but unfilled order can still be cancelled.

Listings require the creator to own the NFT. Token-specific offers refer to an existing supported NFT but need not escrow money. They can become unfundable after creation; UI availability must reflect that. The normal offer UI can approve and create the order in one account multicall.

A collection offer commits to any single eligible NFT in the specified collection. The first successful fill consumes it. The maker can create several independent offers to seek multiple NFTs; there is no shared partially fillable order. The fill must validate the collection, selected token, maker royalty cap and accepting seller's minimum proceeds.

No in-place economic amendment: price changes use cancel-and-create in an atomic wallet multicall. Multiple listings for the same NFT may exist, but only one can succeed under current ownership. v1 quantity is always one; it has no zero-quantity sentinel and no partial fills.

Temporary invalidity is not cancellation. A listing may become executable again if its maker reacquires the NFT or restores approval before expiry. An offer may become executable again when funds/allowance are restored. The UI must explain this; permanent withdrawal requires cancellation. Avoid pretending the contract can detect all intervening transfers without cooperation from the NFT contract.

## 5. Exact payment model

Recommended model: the displayed order price is **buyer debit**, inclusive of marketplace fee and royalty. Network fees are separate.

For buyer debit `P`, order-snapshotted protocol fee rate `b`, protocol fee `F`, and royalty `R` resolved under the committed order policy:

```text
F = floor(P × b / 10_000)
seller_proceeds = P - F - R
buyer_debit = seller_proceeds + F + R = P
```

All arithmetic is checked and integer-exact. Avoid multiplication overflow with a proven quotient/remainder formulation or checked wider arithmetic; do not silently cap a uint256 price into a smaller type. Require `F + R < P` for positive seller proceeds. The protocol fee has a constructor- and setter-validated ceiling of 500 bps, with the user selecting 500 bps for initial deployment on 8 October 2026.

There is no executor-selected client fee or recipient. A seller accepting a token offer cannot charge its buyer more than `P`, regardless of the buyer's excess ERC-20 allowance. This is a mandatory regression against the legacy behavior.

Illustrative only: at a 2% protocol fee and royalty amount 5, an order with buyer debit 100 pays the seller 93, the protocol 2 and the royalty recipient 5. The buyer spends 100.

These are economic allocations, not an assumption that every role has a different address. If buyer, seller, protocol or royalty addresses overlap, coalesce payouts consistently and distinguish gross buyer debit from net balance changes. A buyer who is also a royalty recipient may have a smaller net decrease; they can never be charged more than the committed total. Test aliases and self-transfers explicitly.

### Royalty policy

Proposed policy for listings/token offers: resolve supported royalty behavior during order creation and freeze the absolute amount/recipient in that order. If the collection supports ERC-2981, read its quote for `P`; if it verifiably does not, use zero. An error from a supported interface is not zero royalty. Reject malformed recipients and quotes above the maker's supplied maximum royalty amount or the settlement bound.

The maker submits a `max_royalty_amount` so a metadata/collection change between preview and creation cannot silently increase the deduction beyond their tolerance. The created order event records the exact accepted amounts. For offer acceptance, the seller also supplies `min_seller_proceeds`.

For token-specific orders, later royalty changes apply to new orders. A collection offer cannot snapshot an unknown token: store the maker's maximum royalty amount, resolve the selected token's royalty at fill, enforce the cap and accepting seller's minimum proceeds, and record the actual recipient/amount in the fill event. Buyer debit stays fixed. The user accepted both policies; tests cover token-specific royalty differences and changes between preview and execution.

## 6. Interface

Conceptual interface; exact Cairo types and error selectors will be committed before implementation.

| Entry point | Authorized caller and behavior |
| --- | --- |
| `create_listing(terms, max_royalty_amount, max_fee_bps)` | Current NFT owner creates immutable sell terms; returns maker nonce |
| `create_offer(terms, max_royalty_amount, max_fee_bps)` | Buyer creates immutable terms for one specific NFT; returns maker nonce |
| `create_collection_offer(terms, max_royalty_amount, max_fee_bps)` | Buyer commits collection-wide one-shot terms and a royalty cap; returns maker nonce |
| `cancel_order(nonce)` | Maker cancels their open order, including when expired/paused/disabled |
| `cancel_orders(nonces)` | Maker cancels a bounded batch atomically; define/reject duplicate nonces |
| `buy_listing(key, currency, max_total)` | Caller pays and receives NFT; validates expected currency and total |
| `buy_many(keys, currency, max_total, deadline)` | Caller buys up to 25 listings atomically in one currency |
| `accept_offer(key, currency, min_seller_proceeds)` | Caller must own/approve the specified NFT; offer maker pays exact debit and receives NFT |
| `accept_collection_offer(key, token_id, currency, min_seller_proceeds)` | Caller supplies one NFT from the committed collection; enforces royalty cap and consumes the whole order |
| `get_order(key)` | Direct immutable terms and stored state |
| `quote_terms(collection, token_id, buyer_debit)` | Nonbinding creation quote; creation repeats checks and applies caller limits |
| `set_fee(fee_bps, fee_recipient)` | Administrator atomically updates the new-order rate (0–500 bps) and nonzero recipient for future fills; available while paused |
| `get_config()` | Deployment version, current fee settings, pause and capabilities |

For cancellation, unknown order or filled order returns a clear error; repeat cancellation can be an idempotent no-op, without emitting a second cancellation event. The batch must follow the same explicit rule for each member.

For v1 there is no arbitrary `on_behalf_of`, payment recipient, NFT recipient, call target or callback data supplied by a taker. A listing's seller is its maker; an offer's buyer is its maker, including collection offers. Listing buyers receive their own NFT and offer accepters receive their own proceeds. Gift destinations, aggregators, relayers and alternate payout addresses can be scoped later with explicit authorization.

Creation authorization uses Starknet account execution and caller identity. The contract does not assume an externally owned account or a particular wallet signature scheme. Signed off-chain orders and SNIP-12 message validation are deferred by user choice.

## 7. Fill execution and atomic cart

Use one shared reentrancy guard around state-changing external entrypoints that can interact with asset/account code, including cancellation paths that could otherwise change order state during a callback. Batch entrypoints call internal settlement helpers under one guard; do not nest public guarded functions.

For a cart:

1. Enforce length 1–25, one expected currency, deadline, unique order keys and unique `(collection, token_id)` values.
2. Read immutable orders and ensure correct side, open state, unexpired terms, supported assets and unpaused trading. Reject self-purchases in v1.
3. Compute exact per-order deductions and summed buyer debit with overflow checks. Require the sum not to exceed caller `max_total`.
4. Validate current ownership and per-token or collection-wide approval. Payment transfers must check success for every allowed currency's proven ABI behavior.
5. Mark all selected orders filled before executing settlement interactions. All state is inside the same chain transaction and rolls back if an external call fails.
6. Pay seller, protocol and royalty amounts, transfer NFTs safely to the caller, and emit one complete fill event per order. A malicious receiver/token callback cannot fill or cancel another selected order through reentry.

The reference design pays directly from buyer to recipients without retaining balances. Batch protocol payments may be aggregated after calculating and rounding each order's fee independently. Coalescing seller/royalty payments is an optional measured optimization; it must not change each order's economics or recipient accounting. Do not add an escrow ledger simply to claim fewer transfers.

The frontend executes approval plus `buy_many` as one account multicall when required. Failed settlement must revert the transaction's earlier effects, including approval changes according to the supported account's atomic execution behavior. Verify this with each supported wallet/account rather than relying only on mocks.

Offers use the same settlement/accounting core with buyer and seller roles reversed. Overlapping offers are not reserved balances: one successful fill may render others unfundable. No executor can use the buyer's extra allowance to enlarge a stored order.

## 8. Administration and supported assets

Recommended baseline: non-upgradeable settlement contract, with a dedicated multisig-controlled administrator. New code deploys to a new address. This choice requires product confirmation before deployment; the scope does not introduce an upgrade proxy by default.

Allow only narrowly defined administration: pause/resume trading, register supported collections/currencies, disable/re-enable trading for a registered asset, two-step administrator transfer, and bounded fee-policy updates. Changes emit explicit events. Cancellation remains available regardless of those trading switches.

The administrator cannot transfer users' funds/NFTs, fill for an arbitrary payer, rewrite/cancel maker orders, change existing orders' fee rates, replace the contract class, or execute arbitrary external calls. Fee recipient rotation affects future fills but cannot change gross buyer debit or seller deductions. Any accidental-funds rescue function is excluded from the first version unless separately justified and specified.

Approved token contracts can themselves be upgradeable. Capture their identity/behavior in compatibility tests and monitor changes; our own immutability does not make external asset code immutable.

## 9. Events as the indexing interface

The contract emits public, versioned lifecycle events. The Node backend needs only RPC, this ABI and NFT transfer/approval/metadata sources; no World/model decoder belongs in the new trading path.

| Event | Required content |
| --- | --- |
| `MarketplaceInitialized` | Schema/deployment version, initial fees/receiver, administrator and initial policy; chunk asset registry events if needed |
| `FeePolicyChanged` | New default fee rate and fee recipient; replay updates configuration without rewriting order snapshots |
| `OrderCreated` | Maker/nonce, kind, collection and optional token, currency, exact buyer debit, protocol terms, royalty snapshot or cap/policy, expiry |
| `OrderCancelled` | Maker/nonce and cancelling maker |
| `OrderFilled` | Maker/nonce, buyer, seller, collection/token, currency, buyer debit, seller proceeds, fee/royalty recipients and amounts |
| `TradingPaused` / `TradingResumed` | Caller and resulting status |
| `CollectionPolicyChanged` / `CurrencyPolicyChanged` | Address, resulting support/trading policy and caller |
| Administration transfer events | Proposed/accepted administrator identities |

Use event keys for the event selector and high-value filter fields; benchmark key/data size. Block number/time and transaction identity come from receipts/blocks rather than repeated fields where unambiguous. Full creation terms and terminal events must reconstruct order state from deployment. A fill event records actual paid amounts, not an ambiguous remaining quantity.

Compare an index rebuilt only from contract/NFT events with direct `get_order` and owner reads. Persist raw receipts/event positions so callback event ordering and reorgs remain reproducible. Old Arcade history, if retained, is a distinct optional legacy adapter and cannot become a dependency for the new market.

## 10. Optimization plan

Measure under a pinned compiler, contract class, account class and chain/devnet version. Include account validation, calldata, external token behavior and approval costs in transaction measurements. Report resource usage separately from volatile STRK fee estimates.

| Candidate | Expected benefit to test | Constraint |
| --- | --- | --- |
| Direct order storage and immutable terms | Remove World indirection and repeated model work | No loss of queryability or event completeness |
| Separate compact terminal state | Small fill/cancel updates | Filled/cancelled never reopens |
| Pack bounded side/state/timestamps | Reduce storage footprint | Range-safe, independently tested encode/decode |
| Maker-local nonce | Avoid shared order-creation counter | No unproven throughput claim; benchmark the real workload |
| Native bounded `buy_many` | Share validation/guard/config work, optionally aggregate payments | Exact per-order rounding and all-or-nothing execution |
| Registered token interface policy | Avoid repeated generic standard discovery | External contract upgrades still require compatibility handling |

Reference types keep uint256 token IDs and payment amounts. A narrower storage representation may be accepted only with explicit supported bounds and demonstrated benefit; no silent precision or range loss. Do not remove reentrancy checks, event evidence or authorization to hit a benchmark.

Benchmark: create listing, create offer, cancel, buy/accept one, and carts of 5/10/25; existing versus fresh approvals; distinct versus repeated recipients; supported wallet account variants. Compare `buy_many` with 25 single fills in an account multicall. Measure storage writes, calldata/event size, execution resources, external calls and p50/p95 end-to-end confirmation separately.

No percentage saving or throughput target is claimed yet. An optimization is adopted only after tests remain equivalent and measured resources improve for the intended workload. A worst-case 25-item cart fitting practical transaction limits is a release requirement; revisit scope explicitly if measurements disprove it.

## 11. Tests and release gates

Implement test-first with a pinned Cairo toolchain and Starknet Foundry. Use independent accounting expectations, fuzz/property tests, malicious callback fixtures and fork tests against supported assets.

Required invariants and scenarios:

- Gross buyer debit is exactly the committed amount; payout components sum to it without overflow or hidden rounding charges. Net balance changes reconcile even when recipient roles share an address.
- Only the maker creates/cancels; only the actual NFT owner accepts an offer; the taker cannot redirect maker assets or add fees.
- Filled/cancelled orders cannot execute again, including across callback reentry or duplicate batch keys.
- Expiry is enforced at the exact boundary; cancellation works while paused and for disabled assets.
- Wrong chain/deployment references never resolve to another order; maker nonces are monotonic and cannot be reused.
- Token-specific and operator approvals both work where supported; transferred/burned/unapproved tokens fail safely.
- False-returning/reverting currencies, malicious royalty responses and NFT receiver reentry cannot leave partial effects.
- One failure in a 25-item cart rolls back payments, NFT moves, order states and emitted events; overflow and duplicate NFTs are rejected.
- Restoration of ownership/funds can restore availability only for orders that remain open; cancellation stays permanent.
- Token-specific snapshots remain fixed. Collection-offer royalties obey the maker's committed cap and taker's minimum proceeds; a different token or mutable royalty quote cannot enlarge buyer debit.
- Collection offers accept only the committed collection and fill once; no valid token ID acts as a wildcard sentinel.
- Fee updates require the current administrator, reject zero recipients and rates above 500 bps, and preserve old listing/token-offer/collection-offer rates. Stale creation consent fails; mixed-rate carts and recipient aliases settle exactly.
- Event replay equals direct state at fixed checkpoints, through cancellation, multiple fills, restart and fork recovery.
- The legacy extra-client-fee scenario is impossible because no uncommitted surcharge exists in the interface.

Release requires reproducible build/class hashes, green tests, measured carts, independent contract review with findings resolved, Sepolia end-to-end wallet lifecycle, owned indexer reconciliation, and explicit production deployment parameters/authority. None is implied complete by this design document.

## 12. Delivery and migration

Follow milestones M0–M8 in [the build plan](./BUILD-PLAN.md). Finalize interface/economics at M0, prove reference settlement at M1, integrate the event slice at M2, benchmark atomic carts at M4, and complete independent review before production launch. Keep delivery status there rather than maintaining a second milestone list.

NFT collections themselves are retained. The replacement changes the marketplace spender/address, so users authorize it and recreate their intended orders. We do not copy active Arcade orders into new executable orders on users' behalf. Inspect active legacy liquidity and provide a clear legacy identification/cancellation route where feasible. Historical legacy trades, if imported, remain tagged by their original deployment.

After new orders exist, rollback means keeping the new deployment discoverable and cancellable, optionally pausing fills and reverting the UI/API to a compatible version. It does not mean pretending new-chain orders disappeared or silently sending users back to old settlement.

## 13. Open product choices

Confirmed: inclusive buyer-debit pricing, token-order royalty snapshots, capped fill-time collection-offer royalties, and non-upgradeable settlement with limited administration. Implementation uses a 500-bps protocol ceiling. The initial protocol rate is 500 bps and the recipient is the local signer, as selected on 8 October 2026. Realms is the sole initial NFT collection. STRK and LORDS are the selected payment currencies. Initial administrator and transaction fee ceiling remain deployment inputs.

Deferred contract features: off-chain signed orders, trait/criteria offers, private/reserved orders and ERC-1155/partial fills. Also defer auctions, arbitrary routers, reward tokens, referral/client-fee machinery and gas sponsorship unless a later requirement justifies them.

## Sources and design provenance

The product boundaries come from the user's choices in this chat. Economic rules, interface, event requirements and architecture above are our proposed design, not claims about an existing standard implementation.

- [Contract assessment](./CONTRACT-ASSESSMENT-2026-10-06.md): legacy behavior and observed risk motivating the replacement.
- [Starknet accounts](https://docs.starknet.io/learn/protocol/accounts) and [transactions](https://docs.starknet.io/learn/protocol/transactions): account-based execution context; supported-wallet atomic behavior must be tested.
- [Starknet fees](https://docs.starknet.io/learn/protocol/fees): resource-based measurement context.
- [Cairo events](https://www.starknet.io/cairo-book/ch101-03-contract-events.html) and [storage optimization](https://www.starknet.io/cairo-book/ch103-01-optimizing-storage-costs.html): implementation mechanisms to evaluate, not automatic performance guarantees.
- [OpenZeppelin Cairo security](https://docs.openzeppelin.com/contracts-cairo/4.x/security): candidate primitive guidance; pin a compatible version before code adoption.

On 8 October 2026 the user authorized administrator updates to the fee percentage and recipient. This supersedes the original deployment-fixed fee policy; contract code remains non-upgradeable.
