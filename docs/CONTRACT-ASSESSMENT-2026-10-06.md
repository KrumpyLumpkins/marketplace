# Arcade marketplace contract assessment

6 October 2026. Scope: suitability of the existing marketplace contracts for a standalone marketplace with an owned Node.js indexer. This is a focused code and deployment assessment, not a complete contract audit.

Subsequent decision: the user selected new standalone Cairo contracts with on-chain ERC-721 listings, token-specific offers and an atomic cart. See the active [contract scope](./CONTRACT-SCOPE.md); this assessment preserves the evidence that informed that decision.

## Recommendation

The contracts implement a usable marketplace, but I do not recommend adopting them unchanged as the long-term foundation without resolving the offer fee issue and accepting their governance model. For the user's desired small, independent marketplace, a standalone Cairo contract with direct storage and explicit lifecycle events is the better design candidate. A new contract is not authorized by this assessment and is not automatically safer: it needs tests, independent review and a migration plan.

Dojo itself is not the cause of the fee problem. Its shared storage, schema/permission and upgrade machinery adds complexity that can be justified for Arcade's larger platform but is less attractive for this project's narrow trading requirements.

## Evidence and deployment identity

Source snapshot: `cartridge-gg/arcade@c0355bcd142627d06fb639fd7bf3ea8b57f80d64`.

Read-only RPC observations on mainnet:

- Observation block: `15977057`, hash `0x69aa4fbe7a00e64c795b4ce59a04df66a1e65b4eb420d5444336864bffb959`.
- Marketplace address: `0x6bbf16b6c67b1bef27a187b499b2f3a14af31646c2c90d64f11b9087c3f527c`.
- Marketplace class: `0x58fcd599b5037e899a479324dc5d09d46db2640d0587a41259ef3db0c95b858`.
- World address: `0x7a079295990e43441a7389fdc3b9ba063c6cd6aee16fb846f598c42a9f04ff7`.
- World class: `0x613551abceb2b37073b1149bb862ea70cf029981ce1ca47e9dd7c7ab97cb65d`.
- Both class hashes match the snapshot's manifest. The marketplace's `world_dispatcher` returns the expected World address.
- The fetched deployed ABI exposes the expected list/offer/cancel/execute functions and an upgrade function.
- Direct Book read at the observation block: version 1, not paused, royalties enabled, protocol fee numerator 0, order counter 13,866. The counter is not an active-order or trading-volume measurement.

The class-hash probes used `latest`; the subsequently fetched classes, ABI, dispatcher, permissions and Book were read at the fixed block above. Matching the deployment manifest and ABI does not establish a reproducible source-to-bytecode match. No production transaction or exploit was submitted, and no forked execution of the deployed class was performed.

Source: [mainnet deployment manifest](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/manifest_mainnet.json).

## What the design does well

- Supports ERC-721 and ERC-1155 assets, sell listings, token offers and collection-wide buy intents.
- Uses noncustodial approvals/transfers rather than requiring assets to sit in marketplace escrow.
- Execution validates order status/expiry/quantity and asset/funding conditions. Order state is updated before settlement transfers, which is a useful defensive pattern but not a complete reentrancy assessment.
- Includes protocol/client fee and royalty handling, role-controlled configuration and pause capability.
- Contains Cairo tests for trading, cancellation, invalidity/removal and fees for both NFT standards. Test presence is not audit certification; this review ran only the added targeted regression below.

Sources: [marketplace entrypoints](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/contracts/src/systems/marketplace.cairo), [order state transitions](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/models/order.cairo), [settlement checks](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/components/verifiable.cairo), [test tree](https://github.com/cartridge-gg/arcade/tree/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/tests).

## Confirmed source-level security finding

### HIGH: offer accepter selects an extra charge against the maker

Confidence: high for the inspected source and local execution. Applicability to the deployed bytecode still needs reproducible build or fork validation.

The maker's offer stores its price but does not commit a client fee limit/receiver. When someone accepts the offer, that caller supplies `client_fee` and `client_receiver`. The permitted rate is up to 10,000/10,000, or 100%. Buy-order settlement charges the maker `nominal_price + client_fee` and sends the fee to the executor-selected recipient.

Preconditions: the offer is otherwise executable, the accepter can supply the NFT, and the maker has enough ERC-20 balance and marketplace allowance for the inflated total. Exact limited allowance can restrict the loss; larger outstanding allowance exposes additional funds. This is a bounded overcharge for the matched trade, not evidence of an unrestricted wallet drain.

Local regression adapted from the upstream ERC-721 offer-fee test:

- Maker creates an offer with nominal price `1 × 10^18` and approves `2 × 10^18`.
- Accepter supplies a 100% client fee and receives that fee.
- Settlement debits the maker `2 × 10^18`; the test confirms the resulting balances.
- Command: `RUSTUP_TOOLCHAIN=1.94.1 scarb cairo-test -p orderbook -f test_review_offer_executor_chooses_full_fee`.
- Result: **1 passed; 0 failed; 71 filtered out** using Scarb 2.13.1.

This was executed solely in a scratch source checkout with mock assets/accounts. The default Rust toolchain was incomplete; using the already installed 1.94.1 toolchain allowed the test to run. No backend production dependency was introduced.

An indexer cannot fix this. A frontend warning or a zero-fee default also cannot stop direct calls. A contract fix should bind the maker's maximum total debit and fee terms to the order, or eliminate executor-controlled surcharges against the maker. Until contract behavior is addressed, avoid presenting unrestricted offer creation as safe merely because our UI uses a small fee.

Sources: [caller-supplied fee and buyer debit](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/components/buyable.cairo#L173), [fee bounds](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/models/book.cairo#L98), [stored order fields](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/models/index.cairo#L24), [upstream fee test](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/tests/erc721/test_fees.cairo#L68).

## Integration and product limitations

These are confirmed behaviors or compatibility concerns, not additional claims of theft vulnerabilities.

| Behavior | Consequence |
| --- | --- |
| `get_validity` checks funding/asset/expiry but omits stored status and Book pause | It cannot be used alone to tell the UI that an order is executable; execution itself still checks status and pause |
| Cancel calls require Book not paused | Users cannot cancel orders through this path during a pause; token approvals can be revoked separately where supported |
| No dedicated cancellation event in the inspected order components | An independent indexer must follow model mutations or an equivalent authoritative state history |
| Minimum creation lifetime is eight hours | Current one-hour UI expiry option conflicts with contract behavior |
| ERC-721 uses quantity zero and requires collection-wide approval | Our adapter must encode that sentinel; token-specific approval alone does not satisfy the helper |
| Protocol fee can be configured as high as 100%, and royalties can be changed globally | Administrative trust and fee-change behavior need an explicit product policy; this is not a permissionless attacker finding |
| ERC-20 transfer return value is not checked in `pay` | Token compatibility requires review; do not assume every ERC-20 implementation is safe to support |

Sources: [sell validity and cancellation](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/components/sellable.cairo), [duration constants](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/constants.cairo), [approval/payment implementation](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/components/verifiable.cairo), [administration](https://github.com/cartridge-gg/arcade/blob/c0355bcd142627d06fb639fd7bf3ea8b57f80d64/packages/orderbook/src/components/manageable.cairo).

## How much complexity comes from Dojo?

This marketplace uses external World storage for Book/Order models, namespace/model access control, model registration/layouts and World-mediated events. Our no-Torii indexer must understand that protocol. A standalone marketplace can keep orders in ordinary contract storage and emit explicit `OrderCreated`, `OrderCancelled` and `OrderFilled` events with complete identifiers and fill values.

The shared environment also broadens the trusted code and permission set. At the observed block, direct `is_writer` calls returned true for the ARCADE namespace for Marketplace, Slot, Social, Wallet and StarterpackRegistry. `is_owner` returned true for Registry and StarterpackRegistry. The configured administrative address also returned true for World ownership.

These observations do not mean arbitrary users can write orders, nor prove that any of those contracts exposes an abusive path. They mean the ownership/writer and upgrade analysis extends beyond the marketplace contract itself. Dojo's permission logic allows namespace permissions to authorize model access, so broader namespace grants matter to isolation.

Benefits of Dojo include shared model infrastructure, introspection, permissions and integration with its existing tooling. Those benefits can justify the architecture within Arcade. For a narrowly scoped independent marketplace deliberately replacing that tooling, much of the machinery becomes work we must implement and maintain ourselves. I have not benchmarked gas or throughput and make no numerical performance claim.

Source: [World permission resolution](https://github.com/dojoengine/dojo/blob/v1.8.0/crates/dojo/core/src/world/world_contract.cairo#L1216). Live permission and Book observations are saved under `.context/arcade-contract-review/` in the local checkout.

## Decision for this project

| Approach | When it makes sense | Main cost |
| --- | --- | --- |
| Retain current deployment | Existing orders/liquidity materially matter and the behavior/governance is acceptable or remediated | Legacy Dojo decoding and retained contract risks |
| Standalone replacement contract | Simplicity, explicit trading guarantees and independent administration are primary goals | New security work, deployment, approvals and order/liquidity migration |

My recommendation is to compare a small standalone contract now, before committing substantial effort to a custom decoder for the existing World. Keep the UI and custom Node backend direction. Define contract requirements around fixed-price sales, whichever offer flows are actually required, maker-bound fee terms, explicit events, exact transfer/approval semantics, cancellation during a pause, reentrancy protection and deliberately limited administration.

Retain standard, reviewed cryptographic/token primitives when implementing Cairo contracts; the user's zero-package Node backend constraint does not justify inventing replacement cryptography or token implementations. A new contract should receive independent review before production trading.

Do not abandon current state blindly: first count active listings/offers by collection and currency, identify current administration/upgrade authority, and decide whether to keep a legacy read/cancel path. The observed Book counter alone cannot establish migration size. Ordinary redeployment means users must approve the new address and recreate orders unless a specific, separately verified migration mechanism exists.

## Limits

No complete audit report for this exact deployment was located in the inspected source and targeted public search; that is not proof that no audit exists. The full upstream test suite, deployed-bytecode exploit test, complete permission census, active-liquidity census and broad external-token/reentrancy analysis remain outstanding. The positive local fee regression and manifest/ABI identity checks are narrower evidence and should be described as such.
