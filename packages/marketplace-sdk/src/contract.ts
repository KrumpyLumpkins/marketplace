import type { QueryClient } from "@tanstack/query-core";
import type {
  AccountAdapter,
  PendingStorage,
  TransactionCoordinator,
} from "./transactions.js";
import { address, unsigned, u64, decodeU256 } from "./encoding.js";
import {
  buildGetConfig,
  buildGetOrder,
  buildQuoteTerms,
  buildSetCollection,
  buildSetCurrency,
  buildSetPaused,
  buildSetFee,
  buildProposeAdmin,
  buildAcceptAdmin,
  type AccountCall,
  type OrderKey,
} from "./protocol.js";
export type ContractBlock =
  | "latest"
  | { block_hash: string }
  | { block_number: number };
export type ContractReadOptions = { blockId?: ContractBlock };
/** Host-owned RPC adapter. No wallet library or RPC credentials are bundled. */
export type ContractReader = {
  getChainId: () => Promise<string | bigint>;
  call: (
    call: AccountCall,
    options: { blockId: ContractBlock; signal?: AbortSignal },
  ) => Promise<string[]>;
};
export type ContractConfig = {
  version: 1;
  admin: string;
  paused: boolean;
  feeBps: number;
  feeRecipient: string;
};
export type ContractOrder = {
  kind: "listing" | "token_offer" | "collection_offer" | null;
  state: "missing" | "open" | "filled" | "cancelled";
  collection: string;
  tokenId: string | null;
  currency: string;
  buyerDebit: string;
  expiry: string;
  royaltyCap: string;
  royaltyRecipient: string;
  royaltyAmount: string;
  feeBps: number;
};
export type ContractQuote = {
  buyerDebit: string;
  protocolFee: string;
  royaltyRecipient: string;
  royaltyAmount: string;
  sellerProceeds: string;
};
function length(values: string[], expected: number) {
  if (!Array.isArray(values) || values.length !== expected)
    throw new Error(
      "Unexpected contract response length. Check the deployment ABI.",
    );
}
const decodedAddress = (value: string, zero = false) =>
  address(`0x${unsigned(value, 251, "address").toString(16)}`, zero);
export function decodeContractConfig(values: string[]): ContractConfig {
  length(values, 5);
  if (unsigned(values[0], 32, "version") !== 1n)
    throw new Error("Unsupported marketplace contract version.");
  const paused = unsigned(values[2], 8, "paused");
  if (paused > 1n) throw new Error("Invalid contract boolean.");
  const fee = unsigned(values[3], 16, "fee");
  if (fee > 500n)
    throw new Error("Protocol fee exceeds the contract 500 bps cap.");
  return {
    version: 1,
    admin: decodedAddress(values[1]),
    paused: paused === 1n,
    feeBps: Number(fee),
    feeRecipient: decodedAddress(values[4]),
  };
}
export function decodeContractOrder(values: string[]): ContractOrder {
  length(values, 15);
  const kind = Number(unsigned(values[0], 8, "kind")),
    state = Number(unsigned(values[14], 8, "state"));
  if (kind > 3 || state > 3 || (state === 0 ? kind !== 0 : kind === 0))
    throw new Error("Unknown contract order kind or state.");
  const kinds = [null, "listing", "token_offer", "collection_offer"] as const,
    states = ["missing", "open", "filled", "cancelled"] as const;
  const tokenId = decodeU256(values[2], values[3]);
  const fee = unsigned(values[13], 16, "fee");
  if (fee > 500n) throw new Error("Protocol fee exceeds 500 bps.");
  return {
    kind: kinds[kind],
    state: states[state],
    collection: decodedAddress(values[1], state === 0),
    tokenId: kind === 0 || kind === 3 ? null : tokenId,
    currency: decodedAddress(values[4], state === 0),
    buyerDebit: decodeU256(values[5], values[6]),
    expiry: u64(values[7]),
    royaltyCap: decodeU256(values[8], values[9]),
    royaltyRecipient: decodedAddress(values[10], true),
    royaltyAmount: decodeU256(values[11], values[12]),
    feeBps: Number(fee),
  };
}
export function decodeContractQuote(
  values: string[],
  buyerDebit: string,
): ContractQuote {
  length(values, 7);
  const price = unsigned(buyerDebit, 256, "buyer debit"),
    protocolFee = decodeU256(values[0], values[1]),
    royaltyRecipient = decodedAddress(values[2], true),
    royaltyAmount = decodeU256(values[3], values[4]),
    sellerProceeds = decodeU256(values[5], values[6]);
  if (
    BigInt(protocolFee) + BigInt(royaltyAmount) + BigInt(sellerProceeds) !==
      price ||
    BigInt(sellerProceeds) === 0n ||
    (BigInt(royaltyAmount) > 0n && BigInt(royaltyRecipient) === 0n)
  )
    throw new Error("Invalid contract quote accounting.");
  return {
    buyerDebit: price.toString(),
    protocolFee,
    royaltyRecipient,
    royaltyAmount,
    sellerProceeds,
  };
}
export type PreparedAdminAction = {
  action:
    | "set_collection"
    | "set_currency"
    | "set_fee"
    | "set_paused"
    | "propose_admin"
    | "accept_admin";
  account: string;
  marketplace: string;
  chainId: string;
  adminAtReview: string;
  expiresAt: number;
  calls: AccountCall[];
};
export function createContractAccess(deps: {
  chain: string;
  chainId: string;
  marketplace?: string;
  reader?: ContractReader;
  queryClient: QueryClient;
  queryKey: (
    path: string,
    query: Record<string, unknown>,
  ) => readonly unknown[];
  transactions: TransactionCoordinator;
}) {
  const market = () => {
    if (!deps.marketplace)
      throw new Error("Pin expectedMarketplace for direct contract access.");
    return address(deps.marketplace);
  };
  function options<T>(
    entrypoint: string,
    args: string[],
    build: () => AccountCall,
    decode: (values: string[]) => T,
    read: ContractReadOptions = {},
  ) {
    const blockId =
      typeof read.blockId === "object"
        ? { ...read.blockId }
        : (read.blockId ?? "latest");
    return {
      queryKey: deps.queryKey("/contract", { entrypoint, args, blockId }),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const call = build();
        if (typeof blockId === "object") {
          if ("block_number" in blockId) {
            if (
              !Number.isSafeInteger(blockId.block_number) ||
              blockId.block_number < 0
            )
              throw new Error("Invalid block number.");
          } else unsigned(blockId.block_hash, 252, "block hash");
        }
        if (!deps.reader)
          throw new Error("Configure a ContractReader for direct RPC reads.");
        if (BigInt(await deps.reader.getChainId()) !== BigInt(deps.chainId))
          throw new Error("Contract reader is on another network.");
        signal.throwIfAborted();
        return decode(await deps.reader.call(call, { blockId, signal }));
      },
      retry: false as const,
      staleTime: 0,
    };
  }
  const configQuery = (read: ContractReadOptions = {}) =>
    options(
      "get_config",
      [],
      () => buildGetConfig(market()),
      decodeContractConfig,
      read,
    );
  const orderQuery = (key: OrderKey, read: ContractReadOptions = {}) => {
    const bound = { ...key };
    return options(
      "get_order",
      [bound.maker, bound.nonce],
      () => buildGetOrder(market(), bound),
      decodeContractOrder,
      read,
    );
  };
  const quoteQuery = (
    collection: string,
    tokenId: string,
    buyerDebit: string,
    read: ContractReadOptions = {},
  ) =>
    options(
      "quote_terms",
      [collection, tokenId, buyerDebit],
      () => buildQuoteTerms(market(), collection, tokenId, buyerDebit),
      (values) => decodeContractQuote(values, buyerDebit),
      read,
    );
  const getConfig = (read: ContractReadOptions = {}) =>
    deps.queryClient.fetchQuery(configQuery(read));
  const plans = new WeakSet<PreparedAdminAction>();
  async function prepare(account: string, call: AccountCall) {
    address(account);
    const config = await getConfig();
    if (
      call.entrypoint !== "accept_admin" &&
      BigInt(config.admin) !== BigInt(account)
    )
      throw new Error(
        "Only the contract administrator can prepare this action.",
      );
    const plan = Object.freeze({
      action: call.entrypoint,
      account,
      marketplace: market(),
      chainId: deps.chainId,
      adminAtReview: config.admin,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      calls: Object.freeze([
        Object.freeze({ ...call, calldata: Object.freeze([...call.calldata]) }),
      ]),
    }) as unknown as PreparedAdminAction;
    plans.add(plan);
    return plan;
  }
  return {
    configQuery,
    orderQuery,
    quoteQuery,
    getConfig,
    getOrder: (key: OrderKey, read: ContractReadOptions = {}) =>
      deps.queryClient.fetchQuery(orderQuery(key, read)),
    quoteTerms: (
      collection: string,
      tokenId: string,
      buyerDebit: string,
      read: ContractReadOptions = {},
    ) =>
      deps.queryClient.fetchQuery(
        quoteQuery(collection, tokenId, buyerDebit, read),
      ),
    admin: {
      prepareSetCollection: (
        account: string,
        collection: string,
        enabled: boolean,
      ) => prepare(account, buildSetCollection(market(), collection, enabled)),
      prepareSetCurrency: (
        account: string,
        currency: string,
        enabled: boolean,
      ) => prepare(account, buildSetCurrency(market(), currency, enabled)),
      prepareSetFee: (
        account: string,
        feeBps: number,
        recipient: string,
      ) => prepare(account, buildSetFee(market(), feeBps, recipient)),
      prepareSetPaused: (account: string, paused: boolean) =>
        prepare(account, buildSetPaused(market(), paused)),
      prepareProposeAdmin: (account: string, nominee: string) =>
        prepare(account, buildProposeAdmin(market(), nominee)),
      // There is no pending-admin getter in v1. Cairo validates the nominee at execution.
      prepareAcceptAdmin: (account: string) =>
        prepare(account, buildAcceptAdmin(market())),
      async submit(
        plan: PreparedAdminAction,
        account: AccountAdapter,
        storage?: PendingStorage,
      ) {
        if (
          !plans.has(plan) ||
          plan.expiresAt <= Math.floor(Date.now() / 1000) ||
          BigInt(plan.account) !== BigInt(account.address)
        )
          throw new Error(
            "Administrative review expired or belongs to another client/account.",
          );
        plans.delete(plan);
        const config = await getConfig();
        if (BigInt(config.admin) !== BigInt(plan.adminAtReview))
          throw new Error("Administrator changed. Review the action again.");
        const context = () => ({
          account,
          config: {
            chain: deps.chain,
            chainId: deps.chainId,
            marketplace: market(),
            demo: false,
            status: { safeForCheckout: false },
          },
          expectedMarketplace: market(),
          storage,
        });
        const submitted = await deps.transactions.execute(
          context,
          () => {
            if (
              plan.expiresAt <= Math.floor(Date.now() / 1000) ||
              BigInt(account.address) !== BigInt(plan.account)
            )
              throw new Error(
                "Account changed or administrative review expired.",
              );
            return plan.calls.map((c) => ({ ...c, calldata: [...c.calldata] }));
          },
          "admin",
          false,
        );
        if (!submitted || submitted === true)
          throw new Error(
            deps.transactions.getSnapshot().state.message ||
              "Administrative submission failed.",
          );
        return submitted;
      },
    },
  };
}
