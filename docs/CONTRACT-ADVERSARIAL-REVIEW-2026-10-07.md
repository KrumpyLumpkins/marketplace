# Adversarial review of marketplace v1

Date: 7 October 2026. Scope: the current standalone Cairo settlement contract,
its ABI/manifest, token interfaces and local adversarial tests. The [build plan](BUILD-PLAN.md)
remains authoritative for deployment approval. This is a local implementer review,
not an independent audit or a review of a deployed mainnet instance.

## Result

**No high-confidence vulnerabilities identified in the reviewed settlement code.**
No production contract change was required by this pass. This conclusion assumes
approved assets obey the ERC-721/ERC-20 behavior required by the contract scope;
it does not establish that the candidate launch assets satisfy that assumption.

Reviewed `src/lib.cairo` SHA-256:
`9beb648723cb312cbabe5b032bae188f8a0a38df197868a3f44df800fc90ecd5`.
The normal build reproduces the checked-in ABI, Sierra class hash and compiled
class hash. New hostile fixtures are behind the existing `fixtures` feature and
are excluded from that build.

## Threat model and approach

An attacker can own an account or receiver contract, choose every public order
and fill argument, submit overlapping orders, race fills/cancellations, supply
malicious callback behavior and make external calls revert. The attacker cannot
forge an immediate caller, modify an existing order's immutable terms, or register
arbitrary assets without the administrator. Malicious behavior of an approved
asset is considered for callback/rollback tests; honest token transfer semantics
remain a deployment trust boundary, not something a successful boolean proves.

Traced all 17 public entrypoints and their shared internal paths. Compared source
with the confirmed contract scope, inspected existing tests and supporting
indexer handling, and added 16 adversarial tests. In the receiver matrix, the
outer buy is forwarded by a deployed receiver fixture with **no caller cheat on
the market**, so the nested caller identity follows real contract calls.

## Attacks exercised

| Attack | Result / evidence |
| --- | --- |
| Receiver reentry into every one of the 14 mutating entrypoints | Each rejects with `REENTRANCY`; balances, allowance, NFT owner and order state roll back; an ordinary retry then succeeds |
| Receiver returns an invalid acknowledgement after payment | `BAD_RECEIVER`; earlier payments and filled state roll back |
| ERC-20 callback tries cancellation after updating balances | `REENTRANCY`; transfer and allowance revert, guard remains usable afterward |
| ERC-20 returns false after updating the fee or royalty recipient | `PAYMENT_FAILED`; earlier seller/fee/royalty allocations all revert |
| Late NFT failure in a cart | Existing test confirms all previous transfers/payments/order states revert |
| Two distinct listings for one NFT, or duplicate order key | Cart rejects; a subsequent fill cannot reuse the old ownership |
| Sum of full-width uint256 prices overflows | Fails before payment; another valid order remains fillable |
| Zero price, royalty consumes proceeds, or positive royalty to zero address | Rejects before order allocation; failed creation does not consume nonce |
| Buyer/royalty, seller/royalty and fee/royalty address overlap | Correct net balances without exceeding the committed gross allocation |
| Cancellation batch has a later unknown nonce | Entire batch reverts; repeated known cancellations are idempotent |
| Empty or 26-item buy/cancel batches | `BATCH_SIZE` before state changes; existing 25-item success test still passes |
| Wrong order side/currency, self-trade, exact deadline/expiry boundary | Rejected; valid deadline succeeds |
| Paused and disabled collection/currency with an expired order | Maker can still cancel |
| Replaced or already-consumed administrator nominee | Cannot accept administration |
| Overlapping offers with excess allowance but exhausted balance | Later fill fails atomically and its order remains open |
| Token ID zero and uint256 maximum | Distinct assets settle without truncation/aliasing |
| Full-width allocation fuzzing | New 256-run uint256 property test plus existing 256-run u128 property test preserve positive seller proceeds and allocation conservation |

Tests: [adversarial cases](../contracts/marketplace/tests/test_adversarial.cairo),
[existing suite](../contracts/marketplace/tests/test_contract.cairo), and
[test-only fixtures](../contracts/marketplace/src/mocks.cairo).

## Needs verification before deployment

These are explicit trust/coverage boundaries, not confirmed exploits:

1. **Actual asset compatibility and upgrade authority.** `pay` at
   `src/lib.cairo:592` checks the transfer return value; `settle` at line 627
   relies on the registered NFT's safe-transfer behavior. A lying or taxed token
   can violate economic expectations. Such currencies are explicitly excluded
   by the scope. Verify the exact deployed classes, transfer semantics, royalties
   and upgrade control of each approved asset at a fixed checkpoint. The mock
   callback ABI matches ERC-721, but it is not a full production token/account.
2. **Game eligibility.** `accept_collection_offer` accepts any owned/approved
   token in its specified enabled collection, subject to payment/royalty bounds.
   It has no health, expiration, metadata-trait or game-state predicate. Collection
   offers must not be presented as bids for only the UI's filtered or living
   assets. The launch plan already leaves dynamic eligibility unresolved; settle
   that policy before enabling a collection needing additional restrictions.
3. **Wallet/account behavior and resource limits.** Foundry catch-and-rollback
   tests do not prove every supported account's approval-plus-fill multicall,
   real receiver implementation or production 25-item resource envelope. Existing
   devnet evidence is separate; actual supported-wallet and mainnet-fork checks
   were not run in this pass. Production deployment addresses remain unset.
4. **Independent review.** An outside audit and its remediation verification
   remain required. No formal verification, exhaustive state-space search or
   production asset fork was performed here.

## Investigated behaviors that are intentional

- An unfunded offer can be created; funds remain with its maker, and every fill
  must transfer the committed amounts. Orders are not balance reservations.
- A listing can become executable again after ownership/approval returns. The
  scope explicitly distinguishes temporary unavailability from cancellation.
- Gross `buyer_debit` is an economic allocation; a buyer who is also a payout
  recipient has a smaller net debit. The overlap tests check that distinction.
- `quote_terms` is nonbinding, calls external royalty code, and is not a payment
  authorization. Creation/fill repeats the relevant checks. Cairo `view` is not
  an EVM-style static-call security boundary.

## Validation

- `pnpm contracts:test`: **30 passed**, including **512 total fuzz cases** across
  two property tests and the 14-target receiver attack matrix.
- Normal non-fixture Cairo build: passed; production source, ABI, class hash and
  compiled class hash unchanged against the manifest.
- `pnpm sdk:test`: **40 passed**, including ABI/source-manifest parity.
- Cairo formatting and `git diff --check`: passed.

The earlier 25-item gas figures used older mock implementations. Added fixture
branches change mock execution costs; this review makes no new production gas
comparison. Local logs are in ignored `.context/adversarial-*.log`.

## Primary references

- [OpenZeppelin Cairo ERC-721 interfaces and callbacks](https://docs.openzeppelin.com/contracts-cairo/4.x/api/erc721): checked the collection/receiver interface identifiers and callback shape.
- [OpenZeppelin Cairo ERC-2981 interface](https://docs.openzeppelin.com/contracts-cairo/4.x/api/token_common): checked the royalty interface identifier and tuple shape.
- [Cairo contract function semantics](https://www.starknet.io/cairo-book/ch101-02-contract-functions.html): view functions do not provide a static-call security boundary.
