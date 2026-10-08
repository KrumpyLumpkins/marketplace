import { unsigned, u64, type IntegerInput } from "./encoding.js";
import {
  buildApproval,
  buildBuyMany,
  buildBuyListing,
  buildCancelOrders,
  buildAcceptOffer,
  buildAcceptCollectionOffer,
  buildCancel,
  buildCreateOrder,
  buildNftApproval,
  parseAmount,
  parseOrderKey,
  parseRoyaltyBps,
  type AccountCall,
} from "./protocol.js";
import type { ApiOrder, MarketConfig } from "./types.js";
import type { Requester } from "./client.js";
import type {
  AccountAdapter,
  PendingStorage,
  TransactionCoordinator,
} from "./transactions.js";
export type Preflight = {
  canSubmit: boolean;
  reasons: string[];
  total: string | null;
  currency: string;
  approvalAmount: string;
  expiresAt: number;
  rows: Array<{
    key: string;
    valid: boolean;
    message?: string;
    sellerProceeds: string;
    protocolFee?: string;
    royaltyAmount?: string;
    needsNftApproval?: boolean;
  }>;
};
export type PreparationContext = {
  marketplace: string;
  chain: string;
  account: string;
};
export type CartSelection = {
  orderId: string;
  collection: string;
  tokenId: string;
  price: string;
  currency: string;
};
export class TradePreparationError extends Error {
  constructor(
    message: string,
    public rows: Preflight["rows"] = [],
  ) {
    super(message);
  }
}
export function validateCart(items: CartSelection[]) {
  if (!items.length || items.length > 25)
    throw new TradePreparationError("Choose 1–25 listings.");
  const currency = BigInt(items[0].currency);
  const orders = new Set<string>(),
    assets = new Set<string>();
  for (const item of items) {
    const identity = `${BigInt(item.collection)}:${BigInt(item.tokenId)}`;
    if (orders.has(item.orderId) || assets.has(identity))
      throw new TradePreparationError("Duplicate NFT or order.");
    orders.add(item.orderId);
    assets.add(identity);
    if (BigInt(item.currency) !== currency)
      throw new TradePreparationError("Choose listings in one currency.");
    if (BigInt(item.price) <= 0n)
      throw new TradePreparationError("Invalid listing price.");
  }
  return {
    currency: items[0].currency,
    total: items.reduce((sum, i) => sum + BigInt(i.price), 0n).toString(),
  };
}
export async function prepareCheckout(
  request: Requester,
  context: PreparationContext,
  items: CartSelection[],
) {
  const { currency, total } = validateCart(items),
    keys = items.map((i) =>
      parseOrderKey(i.orderId, context.chain, context.marketplace),
    );
  const quote = await request<Preflight>(
    "/checkout/preflight",
    {},
    {
      account: context.account,
      items: items.map((i, n) => ({
        ...keys[n],
        buyerDebit: i.price,
        collection: i.collection,
        tokenId: i.tokenId,
        currency: i.currency,
      })),
    },
  );
  if (
    !quote.canSubmit ||
    quote.rows.some((r) => !r.valid) ||
    quote.rows.length !== items.length
  )
    throw new TradePreparationError(
      quote.reasons.join(", ") ||
        "Some listings are no longer available. Remove or refresh them.",
      quote.rows,
    );
  for (let i = 0; i < keys.length; i++) {
    const row = parseOrderKey(
      quote.rows[i].key,
      context.chain,
      context.marketplace,
    );
    if (
      BigInt(row.maker) !== BigInt(keys[i].maker) ||
      row.nonce !== keys[i].nonce
    )
      throw new TradePreparationError(
        "Preflight does not match the reviewed orders.",
      );
  }
  if (
    !Number.isSafeInteger(quote.expiresAt) ||
    quote.expiresAt <= Math.floor(Date.now() / 1000)
  )
    throw new TradePreparationError(
      "Preflight expired. Review the cart again.",
    );
  if (
    !quote.total ||
    BigInt(quote.total) !== BigInt(total) ||
    BigInt(quote.currency) !== BigInt(currency)
  )
    throw new TradePreparationError("Cart terms changed. Review the cart.");
  if (
    BigInt(quote.approvalAmount) < 0n ||
    BigInt(quote.approvalAmount) > BigInt(total)
  )
    throw new TradePreparationError("Approval exceeds reviewed payment.");
  return {
    quote,
    calls: [
      ...(BigInt(quote.approvalAmount) > 0n
        ? [buildApproval(currency, context.marketplace, quote.approvalAmount)]
        : []),
      buildBuyMany(context.marketplace, keys, currency, total, quote.expiresAt),
    ],
  };
}
export type OrderIntent = {
  kind: ApiOrder["kind"];
  collection: string;
  assets?: Array<{ collection: string; tokenId: string }>;
  currency: { address: string; decimals: number };
  price: string;
  royaltyPercent?: string;
  maxRoyalty?: string;
  durationSeconds?: number;
  expiry?: IntegerInput;
  replaceIds?: string[];
};
export function prepareOrder(
  context: PreparationContext & { feeBps: number },
  input: OrderIntent,
  now = Math.floor(Date.now() / 1000),
) {
  const assets =
    input.kind === "collection_offer"
      ? [{ collection: input.collection, tokenId: undefined }]
      : (input.assets ?? []);
  if (!assets.length || assets.length > 25)
    throw new Error("Choose a currency and 1–25 assets.");
  const expiry = resolveExpiry(input, now);
  const amount = parseAmount(input.price, input.currency.decimals),
    royaltyCap = resolveRoyaltyCap(input, amount),
    calls: AccountCall[] = [];
  if (input.kind === "collection_offer" && BigInt(royaltyCap) >= BigInt(amount))
    throw new Error("Royalty cap leaves no seller proceeds.");
  for (const id of input.replaceIds ?? []) {
    const key = parseOrderKey(id, context.chain, context.marketplace);
    if (BigInt(key.maker) !== BigInt(context.account))
      throw new Error("Only your orders can be replaced.");
    calls.push(buildCancel(context.marketplace, key.nonce));
  }
  if (input.kind !== "listing")
    calls.push(
      buildApproval(
        input.currency.address,
        context.marketplace,
        (BigInt(amount) * BigInt(assets.length)).toString(),
      ),
    );
  for (const asset of assets) {
    if (input.kind === "listing")
      calls.push(
        buildNftApproval(asset.collection, context.marketplace, asset.tokenId!),
      );
    calls.push(
      buildCreateOrder({
        marketplace: context.marketplace,
        kind: input.kind,
        collection: asset.collection,
        tokenId: asset.tokenId,
        currency: input.currency.address,
        price: amount,
        expiry,
        royaltyCap,
        maxFeeBps: context.feeBps,
      }),
    );
  }
  return calls;
}
export async function previewOffer(
  request: Requester,
  context: PreparationContext,
  order: ApiOrder,
  tokenId: string,
) {
  const key = parseOrderKey(order.id, context.chain, context.marketplace);
  if (
    order.kind === "token_offer" &&
    (order.tokenId == null || BigInt(order.tokenId) !== BigInt(tokenId))
  )
    throw new Error("Offer does not match this NFT.");
  const quote = await request<Preflight>(
    "/checkout/preflight",
    {},
    {
      action: "accept",
      account: context.account,
      items: [{ ...key, tokenId }],
    },
  );
  if (!quote.canSubmit || quote.rows.length !== 1 || !quote.rows[0].valid)
    throw new TradePreparationError(
      quote.reasons.join(", ") ||
        quote.rows.find((r) => !r.valid)?.message ||
        "Offer unavailable.",
      quote.rows,
    );
  return quote;
}
export function prepareAcceptance(
  context: PreparationContext,
  order: ApiOrder,
  tokenId: string,
  quote: Preflight,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !quote.canSubmit ||
    quote.expiresAt <= now ||
    quote.rows.length !== 1 ||
    !quote.rows[0].valid
  )
    throw new Error("Preview expired or unavailable. Review the offer again.");
  const key = parseOrderKey(order.id, context.chain, context.marketplace),
    row = quote.rows[0];
  const quotedKey = parseOrderKey(row.key, context.chain, context.marketplace);
  if (
    BigInt(quotedKey.maker) !== BigInt(key.maker) ||
    quotedKey.nonce !== key.nonce ||
    BigInt(quote.currency) !== BigInt(order.currency)
  )
    throw new Error("Offer review no longer matches these terms.");
  if (
    order.kind === "token_offer" &&
    (order.tokenId == null || BigInt(order.tokenId) !== BigInt(tokenId))
  )
    throw new Error("Offer does not match this NFT.");
  if (order.kind === "listing")
    throw new Error("A listing cannot be accepted as an offer.");
  return [
    ...(row.needsNftApproval
      ? [buildNftApproval(order.collection, context.marketplace, tokenId)]
      : []),
    order.kind === "collection_offer"
      ? buildAcceptCollectionOffer(
          context.marketplace,
          key,
          tokenId,
          order.currency,
          row.sellerProceeds,
        )
      : buildAcceptOffer(
          context.marketplace,
          key,
          order.currency,
          row.sellerProceeds,
        ),
  ];
}
export function prepareCancellation(
  context: PreparationContext,
  ids: string[],
) {
  if (!ids.length || ids.length > 25) throw new Error("Choose 1–25 orders.");
  const nonces = ids.map((id) => {
    const key = parseOrderKey(id, context.chain, context.marketplace);
    if (BigInt(key.maker) !== BigInt(context.account))
      throw new Error("Only your orders can be cancelled.");
    return key.nonce;
  });
  return nonces.length === 1
    ? [buildCancel(context.marketplace, nonces[0])]
    : [buildCancelOrders(context.marketplace, nonces)];
}
export type PreparedTrade = {
  context: PreparationContext;
  chainId: string;
  mode: "trade" | "cancel";
  expiresAt: number;
  calls: AccountCall[];
  quote?: Preflight;
  terms?: {
    kind: ApiOrder["kind"];
    currency: string;
    buyerDebitPerNft: string;
    feeBps: number;
    minimumSellerProceeds: string;
  };
};
export function createTrades(deps: {
  request: Requester;
  config: () => Promise<MarketConfig>;
  cancellationConfig?: () => Promise<MarketConfig>;
  chain: string;
  expectedMarketplace?: string;
  transactions: TransactionCoordinator;
}) {
  const prepared = new WeakSet<PreparedTrade>();
  const configuration = (mode: "trade" | "cancel") =>
    mode === "cancel" && deps.cancellationConfig
      ? deps.cancellationConfig()
      : deps.config();
  async function context(account: string, mode: "trade" | "cancel" = "trade") {
    const config = await configuration(mode);
    if (
      !config.marketplace ||
      !deps.expectedMarketplace ||
      BigInt(config.marketplace) !== BigInt(deps.expectedMarketplace)
    )
      throw new Error("Pin the expected marketplace before preparing a trade.");
    return {
      config,
      value: { account, marketplace: config.marketplace, chain: deps.chain },
    };
  }
  function plan(value: PreparedTrade) {
    const frozen = Object.freeze({
      ...value,
      context: Object.freeze({ ...value.context }),
      terms: value.terms ? Object.freeze({ ...value.terms }) : undefined,
      quote: value.quote
        ? Object.freeze({
            ...value.quote,
            rows: Object.freeze(
              value.quote.rows.map((row) => Object.freeze({ ...row })),
            ),
          })
        : undefined,
      calls: Object.freeze(
        value.calls.map((c) =>
          Object.freeze({ ...c, calldata: Object.freeze([...c.calldata]) }),
        ),
      ),
    }) as unknown as PreparedTrade;
    prepared.add(frozen);
    return frozen;
  }
  const order = async (account: string, input: OrderIntent) => {
    const c = await context(account);
    return plan({
      context: c.value,
      chainId: c.config.chainId,
      mode: "trade",
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      calls: prepareOrder({ ...c.value, feeBps: c.config.feeBps }, input),
      terms: {
        kind: input.kind,
        currency: input.currency.address,
        buyerDebitPerNft: parseAmount(input.price, input.currency.decimals),
        feeBps: c.config.feeBps,
        minimumSellerProceeds: estimateSellerProceeds({
          price: input.price,
          decimals: input.currency.decimals,
          feeBps: c.config.feeBps,
          royaltyPercent: input.royaltyPercent,
          maxRoyalty: input.maxRoyalty,
          kind: input.kind,
          count:
            input.kind === "collection_offer" ? 1 : (input.assets?.length ?? 0),
        }),
      },
    });
  };
  return {
    prepareListing: (account: string, input: Omit<OrderIntent, "kind">) =>
      order(account, { ...input, kind: "listing" }),
    prepareTokenOffer: (account: string, input: Omit<OrderIntent, "kind">) =>
      order(account, { ...input, kind: "token_offer" }),
    prepareCollectionOffer: (
      account: string,
      input: Omit<OrderIntent, "kind">,
    ) => order(account, { ...input, kind: "collection_offer" }),
    prepareReprice: (
      account: string,
      input: Omit<OrderIntent, "kind"> & { replaceIds: string[] },
    ) => order(account, { ...input, kind: "listing" }),
    async prepareBuy(account: string, items: CartSelection[]) {
      const c = await context(account),
        result = await prepareCheckout(deps.request, c.value, items);
      return plan({
        context: c.value,
        chainId: c.config.chainId,
        mode: "trade",
        expiresAt: result.quote.expiresAt,
        ...result,
      });
    },
    async prepareBuyListing(account: string, item: CartSelection) {
      const c = await context(account),
        result = await prepareCheckout(deps.request, c.value, [item]);
      result.calls[result.calls.length - 1] = buildBuyListing(
        c.value.marketplace,
        parseOrderKey(item.orderId, c.value.chain, c.value.marketplace),
        item.currency,
        item.price,
      );
      return plan({
        context: c.value,
        chainId: c.config.chainId,
        mode: "trade",
        expiresAt: result.quote.expiresAt,
        ...result,
      });
    },
    async prepareAcceptOffer(
      account: string,
      offer: ApiOrder,
      tokenId: string,
    ) {
      const c = await context(account),
        quote = await previewOffer(deps.request, c.value, offer, tokenId);
      return plan({
        context: c.value,
        chainId: c.config.chainId,
        mode: "trade",
        expiresAt: quote.expiresAt,
        calls: prepareAcceptance(c.value, offer, tokenId, quote),
        quote,
      });
    },
    async prepareCancel(account: string, ids: string[]) {
      const c = await context(account, "cancel");
      return plan({
        context: c.value,
        chainId: c.config.chainId,
        mode: "cancel",
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        calls: prepareCancellation(c.value, ids),
      });
    },
    async submit(
      value: PreparedTrade,
      account: AccountAdapter,
      storage?: PendingStorage,
    ) {
      if (
        !prepared.has(value) ||
        value.expiresAt <= Math.floor(Date.now() / 1000) ||
        BigInt(account.address) !== BigInt(value.context.account)
      )
        throw new Error(
          "Trade review expired or belongs to another client/account.",
        );
      prepared.delete(value);
      const config = await configuration(value.mode);
      if (value.terms && value.terms.feeBps !== config.feeBps)
        throw new Error("Fee terms changed. Review the order again.");
      const getContext = () => ({
        account,
        config,
        expectedMarketplace: deps.expectedMarketplace,
        storage,
      });
      const submitted = await deps.transactions.execute(
        getContext,
        () => {
          if (BigInt(account.address) !== BigInt(value.context.account))
            throw new Error("Wallet changed. Review the trade again.");
          if (value.expiresAt <= Math.floor(Date.now() / 1000))
            throw new Error("Trade review expired.");
          return value.calls.map((c) => ({ ...c, calldata: [...c.calldata] }));
        },
        value.mode,
        false,
      );
      if (!submitted || submitted === true)
        throw new Error(
          deps.transactions.getSnapshot().state.message ||
            "Submission did not complete.",
        );
      return submitted;
    },
  };
}
export function estimateSellerProceeds(input: {
  price: string;
  decimals: number;
  feeBps: number;
  royaltyPercent?: string;
  maxRoyalty?: string;
  kind?: ApiOrder["kind"];
  count: number;
}) {
  const amount = BigInt(parseAmount(input.price, input.decimals));
  if (
    !Number.isInteger(input.feeBps) ||
    input.feeBps < 0 ||
    input.feeBps > 500 ||
    !Number.isInteger(input.count) ||
    input.count < 1 ||
    input.count > 25
  )
    throw new Error("Invalid fee or asset count.");
  const fee = (amount * BigInt(input.feeBps)) / 10000n,
    cap = BigInt(resolveRoyaltyCap(input, amount.toString()));
  const minimum = amount - fee - cap;
  if (input.kind === "collection_offer" && minimum <= 0n)
    throw new Error("Royalty cap leaves no seller proceeds.");
  // Token orders snapshot actual royalties; even an unbounded cap cannot violate Cairo's positive-proceeds check.
  return ((minimum > 0n ? minimum : 1n) * BigInt(input.count)).toString();
}

function resolveRoyaltyCap(
  input: { royaltyPercent?: string; maxRoyalty?: string },
  amount: string,
) {
  if ((input.royaltyPercent === undefined) === (input.maxRoyalty === undefined))
    throw new Error("Specify either royaltyPercent or maxRoyalty.");
  return input.maxRoyalty !== undefined
    ? unsigned(input.maxRoyalty, 256, "royalty cap").toString()
    : (
        (BigInt(amount) * parseRoyaltyBps(input.royaltyPercent!)) /
        10000n
      ).toString();
}
function resolveExpiry(
  input: { durationSeconds?: number; expiry?: IntegerInput },
  now: number,
) {
  if ((input.expiry === undefined) === (input.durationSeconds === undefined))
    throw new Error("Specify either expiry or durationSeconds.");
  const clock = unsigned(now, 64, "current time");
  const expiry =
    input.expiry !== undefined
      ? BigInt(u64(input.expiry))
      : clock + unsigned(input.durationSeconds!, 64, "duration integer");
  if (expiry <= clock) throw new Error("Expiry must be in the future.");
  return u64(expiry);
}
