# OpenSea benchmark: product coverage and gaps

**Historical comparison:** the matrix below describes the scope before the OpenSea launch expansion. [BUILD-PLAN.md](./BUILD-PLAN.md) incorporates the resulting additions and owns the current scope/build sequence. Consult this document for the benchmark evidence and rationale, not current feature status.

6 October 2026. Benchmark: OpenSea-style NFT trading on Starknet. This assessment compares documented product capabilities with our current design scope; it does not claim working implementation or exhaustive parity with every OpenSea product.

## Conclusion

The current scope describes a core trading engine plus collection browsing. It is not yet a complete OpenSea-level marketplace product. Retaining the UI means retaining its foundation and visual design; the missing workflows will require new screens or extensions.

The user has already selected on-chain ERC-721 listings, token-specific offers and an atomic cart. Those remain confirmed. The additions below are recommendations in response to the OpenSea benchmark, not silently approved changes to the launch contract.

## Coverage matrix

“Covered” means specified for the new system, not built or verified. “Partial” means some supporting behavior exists but the full user journey/acceptance criteria are absent.

| Capability | Current scope | Recommendation | Main owner |
| --- | --- | --- | --- |
| Fixed-price listing and purchase | Covered | Retain | Contract + UI |
| Token-specific offers and acceptance | Covered | Retain; add account-level management | Contract + API + UI |
| Cancellation and expiry | Covered | Retain; expose all terminal/unavailable states | Contract + API + UI |
| Cart and sweep | Covered | Preserve clear selection, refresh and single-currency totals | Contract + API + UI |
| Bulk list, reprice and cancel | Partial: bounded cancellation and cancel/create semantics only | Add complete launch workflows; use account multicall before adding specialized functions | UI + transaction adapter |
| Collection-wide offers | Explicitly deferred | Promote to proposed launch scope for a credible general NFT trading product | Contract + API + UI |
| Trait/criteria offers | Not scoped | Design before final contract freeze; phase implementation deliberately | Contract + metadata/proof policy |
| Offers made and offers received | Partial: orders can be queried by collection | Add paged account feeds, actionable balances/allowances and acceptance | API + UI |
| My listings, sold/purchased history | Partial | Add a trader dashboard and order management | API + UI |
| Global collection/NFT/address search | Partial: collection browsing/search exists | Add indexed universal marketplace search with direct token/address resolution | API + UI |
| Full-collection filters and sorting | Covered | Retain game-specific filters and currency-aware sorting | API + UI |
| Sales history, charts, volume, top offer, floor history | Partial: activity and current per-currency floors | Add defined market metrics and history, scoped to our marketplace | Indexer + API + UI |
| Collection onboarding and authenticity | Partial: registry-based admission | Add an operator onboarding/verification workflow at launch | Operations + API + UI |
| Reporting, spam/content handling | Not fully scoped | Add explicit moderation policy and operator actions | Operations + API + UI |
| Offer/sale/cancellation notifications | Deferred | Add in-product notifications for the full product launch; email/push can follow | API + UI |
| Watchlists and richer profiles | Not scoped beyond holdings | Follow-up product layer | API + UI |
| NFT transfer from portfolio | Not scoped | Add if needed for portfolio completeness; calls NFT directly | Wallet adapter + UI |
| ERC-1155 and partial fills | Explicitly deferred | Required only if supported launch collections need them; not current ERC-721 scope | Contract + indexer + UI |
| Private/reserved listings | Not scoped | Decide before freezing a non-upgradeable contract; otherwise phase later | Contract + UI |
| Gasless signed listing/cancellation | Deliberately excluded | Keep the user's on-chain choice; communicate the additional transaction/fee UX | Product + contract |

OpenSea documents collection/trait offers, bulk operations and private orders in its [advanced trading guide](https://docs.opensea.io/docs/collection-offers-and-advanced-trading). Its [discovery guide](https://docs.opensea.io/docs/search-and-discovery) covers searches across collections/NFTs/accounts, and its [analytics guide](https://docs.opensea.io/docs/query-analytics-and-events) provides the benchmark for statistics and history. This matrix's priorities and implementation ownership are our recommendations.

## What I recommend adding to launch

1. **Complete seller workflow:** select several owned NFTs, set prices/durations, see proceeds, list together, change prices through cancel/create, and cancel selected orders. Each operation shows precise expected changes and transaction result.
2. **Complete buyer/offer workflow:** discover tokens, compare current listings and executable offers, create offers, inspect offers made, accept offers received, identify unfunded/expired offers, and cancel them. Incoming offers follow current NFT ownership rather than a permanently cached original owner.
3. **Collection bids:** propose a one-shot collection-wide offer first. One successful fill consumes it; creating several independent offers supports buying several NFTs without immediately introducing a partially fillable shared bid.
4. **Market information:** per-currency floor, top executable bid, sale count/volume over declared periods, recent trades and price/floor history. Define gross versus seller-net prices. Never sum different currencies or label our own venue's volume as all-Starknet volume. History before launch requires separately attributed import.
5. **Discovery and trust:** global search, collection onboarding progress, verified-address/name display, token provenance, report handling, content policy, and explicit limitations for unsupported collections.
6. **Trader dashboard and notifications:** owned items, listings, incoming/outgoing offers and activity, with in-product alerts for meaningful offer/trade changes. Cross-device watchlists/profile preferences introduce authenticated user-owned data and must be scoped explicitly; a wallet-address query alone is not authentication.

This would be a stronger minimum product than a collection page plus buy/list buttons. It still does not require reproducing all of OpenSea's protocol generality, chain coverage or other product lines.

## Contract decisions to resolve before implementation

### Collection offers change the royalty design

Our current contract proposal snapshots royalty for a known token when creating an offer. A collection-wide offer does not know which token will be delivered. Adding it therefore requires a concrete change, not just removing the token ID field.

Proposed extension: the buyer commits an exact total debit, collection, expiry and royalty limit; the chosen token's royalty is resolved and bounded at fill, while the accepting seller supplies minimum proceeds. No executor surcharge is allowed. Alternatively use a verified collection-uniform royalty policy, but do not assume every collection has one. Test token-specific royalty differences and quote changes.

### Trait filters are not trait-offer authorization

For Beasts and Adventurers, metadata can change with game state. A backend saying “this token has the trait” cannot authorize spending the buyer's funds.

Trait offers need a chosen meaning: membership in a fixed token set committed at offer creation, or a predicate enforced from authoritative on-chain state at fill time. A Merkle proof can prove membership in a committed set; it cannot prove that a mutable trait is still true. Also decide who defines the set/predicate and what the maker authorizes. Keep this out of settlement until specified and tested.

OpenSea's [trait-offer guidance](https://support.opensea.io/en/articles/8867017-how-do-i-turn-on-collection-offers-for-traits) itself warns collection creators about changing trait metadata. Our game's mutable attributes require explicit semantics rather than copying an image-collection assumption.

### Immutable contracts make deferrals consequential

Collection/criteria offers, private taker restrictions, ERC-1155 and partial fills alter authorization or state shape. If we deploy an immutable contract without them, later support means another deployment and potentially new approvals/orders. Resolve the intended launch capabilities before finalizing the ABI. Do not add arbitrary extension hooks just to avoid making that decision.

Bulk listing/repricing can initially compose existing entrypoints through account multicall. Those workflows need product work and transaction-limit benchmarks, but do not necessarily require a more general settlement contract.

## Backend additions needed for the product layer

Extend the proposed API with account order queries (made/received/listed plus status), account activity, collection statistics/history, global search, onboarding status and reporting/notification interfaces. Query incoming offers against indexed current ownership. Expose executability recency; highest nominal bid is not always the best usable offer.

Notifications, reports, preferences and verification decisions are application-owned data, not derivable from chain replay. Store and back them up separately from rebuildable chain projections. Wallet authentication, ownership of edits, rate limits, duplicate notification handling and reorg corrections become explicit requirements if those features enter launch scope.

OpenSea's [notification controls](https://support.opensea.io/en/articles/8866965-how-do-i-manage-my-notifications) and [account features](https://support.opensea.io/en/collections/8079232-account-management) are useful product references. No messages or notification services were configured during this assessment.

## Launch acceptance from a trader's perspective

- A seller can find their inventory, list several items, inspect proceeds, reprice/cancel and respond to incoming offers.
- A buyer can search/filter, compare prices within one currency, sweep, bid, manage outstanding offers and see accepted purchases reflected correctly.
- A collector can understand collection identity, current market depth, recent sales and the source/freshness of metrics.
- An operator can onboard a collection, diagnose stale data, handle content reports, and pause trading without trapping maker cancellation.
- The interface handles rejection, reversion, expiry, unavailable assets, unfunded offers and indexing delay without false success or duplicate submission.

The last accepted scope does not yet satisfy every journey above. Label it the **core trading milestone**, and use this proposed expansion to define the broader marketplace launch. No unsupported completeness percentage or “OpenSea parity” claim is warranted.

## Source and verification limits

Compared local contract/backend scope documents with current official OpenSea help/developer pages on 6 October 2026. This was a documentation comparison, not a logged-in OpenSea UX test or an exhaustive feature audit. Auctions, bundles and other historically available features were not assumed to be current launch requirements without checking their present product behavior. No application code or tests changed.
