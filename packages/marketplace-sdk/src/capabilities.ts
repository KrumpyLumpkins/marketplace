/** ABI-drift tests verify both this inventory and its publicly callable exports. */
export const CONTRACT_CAPABILITIES = {
  create_listing: ["client.trades.prepareListing", "sdk.buildCreateOrder"],
  create_offer: ["client.trades.prepareTokenOffer", "sdk.buildCreateOrder"],
  create_collection_offer: [
    "client.trades.prepareCollectionOffer",
    "sdk.buildCreateOrder",
  ],
  cancel_order: ["client.trades.prepareCancel", "sdk.buildCancel"],
  cancel_orders: ["client.trades.prepareCancel", "sdk.buildCancelOrders"],
  buy_listing: ["client.trades.prepareBuyListing", "sdk.buildBuyListing"],
  buy_many: ["client.trades.prepareBuy", "sdk.buildBuyMany"],
  accept_offer: ["client.trades.prepareAcceptOffer", "sdk.buildAcceptOffer"],
  accept_collection_offer: [
    "client.trades.prepareAcceptOffer",
    "sdk.buildAcceptCollectionOffer",
  ],
  get_order: ["client.contract.getOrder", "sdk.buildGetOrder"],
  get_config: ["client.contract.getConfig", "sdk.buildGetConfig"],
  quote_terms: ["client.contract.quoteTerms", "sdk.buildQuoteTerms"],
  set_collection: [
    "client.contract.admin.prepareSetCollection",
    "sdk.buildSetCollection",
  ],
  set_currency: [
    "client.contract.admin.prepareSetCurrency",
    "sdk.buildSetCurrency",
  ],
  set_paused: ["client.contract.admin.prepareSetPaused", "sdk.buildSetPaused"],
  propose_admin: [
    "client.contract.admin.prepareProposeAdmin",
    "sdk.buildProposeAdmin",
  ],
  accept_admin: [
    "client.contract.admin.prepareAcceptAdmin",
    "sdk.buildAcceptAdmin",
  ],
} as const;

export const SUPPORTED_MARKETPLACE_ABI_SHA256 =
  "80927c616ca0865d9544496686405a4aff0a2cae83f670e15590139f110b9927";
