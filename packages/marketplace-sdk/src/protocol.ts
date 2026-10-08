import { address, u64, bool, unsigned, type IntegerInput } from "./encoding.js";
export type AccountCall = {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
};
export type OrderKey = { maker: string; nonce: string };
const MAX = (1n << 256n) - 1n;
export function uint256(value: string | bigint): [string, string] {
  const n = unsigned(value, 256, "Amount");
  if (n < 0n || n > MAX) throw new Error("Amount exceeds uint256.");
  return [(n & ((1n << 128n) - 1n)).toString(), (n >> 128n).toString()];
}
export function parseAmount(input: string, decimals: number) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^\d+(?:\.\d+)?$/.test(input)
  )
    throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  const value =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (value <= 0n || value > MAX) throw new Error("Amount is out of range.");
  return value.toString();
}
export function parseOrderKey(
  id: string,
  chain: string,
  marketplace: string,
): OrderKey {
  const [network, market, maker, nonce, ...rest] = id.split(":");
  if (
    rest.length ||
    network !== chain ||
    !maker ||
    !nonce ||
    BigInt(market) !== BigInt(marketplace) ||
    BigInt(nonce) < 1n ||
    BigInt(nonce) >= 1n << 64n
  )
    throw new Error("Order belongs to another deployment. Refresh your cart.");
  address(market);
  address(marketplace);
  address(maker);
  return { maker, nonce: u64(nonce, true) };
}
export function buildBuyMany(
  marketplace: string,
  keys: OrderKey[],
  currency: string,
  total: string,
  deadline: IntegerInput,
): AccountCall {
  if (!keys.length || keys.length > 25)
    throw new Error("Choose 1–25 listings.");
  if (
    new Set(keys.map((k) => `${BigInt(k.maker)}:${BigInt(k.nonce)}`)).size !==
    keys.length
  )
    throw new Error("Duplicate listing.");
  return {
    contractAddress: address(marketplace),
    entrypoint: "buy_many",
    calldata: [
      String(keys.length),
      ...keys.flatMap((k) => [address(k.maker), u64(k.nonce, true)]),
      address(currency),
      ...uint256(total),
      u64(deadline),
    ],
  };
}
export function buildCreateOrder(o: {
  marketplace: string;
  kind: "listing" | "token_offer" | "collection_offer";
  collection: string;
  tokenId?: string;
  currency: string;
  price: string;
  expiry: IntegerInput;
  royaltyCap: string;
  maxFeeBps: number;
}): AccountCall {
  if (!["listing", "token_offer", "collection_offer"].includes(o.kind))
    throw new Error("Unknown order kind.");
  return {
    contractAddress: address(o.marketplace),
    entrypoint: {
      listing: "create_listing",
      token_offer: "create_offer",
      collection_offer: "create_collection_offer",
    }[o.kind],
    calldata: [
      address(o.collection),
      ...(o.kind === "collection_offer" ? [] : uint256(o.tokenId ?? "")),
      address(o.currency),
      ...uint256(o.price),
      u64(o.expiry),
      ...uint256(o.royaltyCap),
      feeBps(o.maxFeeBps),
    ],
  };
}
export function buildApproval(
  currency: string,
  marketplace: string,
  amount: string,
): AccountCall {
  return {
    contractAddress: address(currency),
    entrypoint: "approve",
    calldata: [address(marketplace), ...uint256(amount)],
  };
}
export function buildNftApproval(
  collection: string,
  marketplace: string,
  tokenId: string,
): AccountCall {
  return {
    contractAddress: address(collection),
    entrypoint: "approve",
    calldata: [address(marketplace), ...uint256(tokenId)],
  };
}
export function buildCancel(marketplace: string, nonce: string): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "cancel_order",
    calldata: [u64(nonce, true)],
  };
}
export function parseRoyaltyBps(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Use a royalty percentage with at most two decimals.");
  const [whole, fraction = ""] = value.split(".");
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (bps > 5000n) throw new Error("Royalty cap must be between 0 and 50%.");
  return bps;
}

export function buildCancelOrders(
  marketplace: string,
  nonces: IntegerInput[],
): AccountCall {
  if (!nonces.length || nonces.length > 25)
    throw new Error("Choose 1–25 orders.");
  return {
    contractAddress: address(marketplace),
    entrypoint: "cancel_orders",
    calldata: [String(nonces.length), ...nonces.map((n) => u64(n, true))],
  };
}
export function buildBuyListing(
  marketplace: string,
  key: OrderKey,
  currency: string,
  maxTotal: string,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "buy_listing",
    calldata: [
      address(key.maker),
      u64(key.nonce, true),
      address(currency),
      ...uint256(maxTotal),
    ],
  };
}
export function buildAcceptOffer(
  marketplace: string,
  key: OrderKey,
  currency: string,
  minProceeds: string,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "accept_offer",
    calldata: [
      address(key.maker),
      u64(key.nonce, true),
      address(currency),
      ...uint256(minProceeds),
    ],
  };
}
export function buildAcceptCollectionOffer(
  marketplace: string,
  key: OrderKey,
  tokenId: string,
  currency: string,
  minProceeds: string,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "accept_collection_offer",
    calldata: [
      address(key.maker),
      u64(key.nonce, true),
      ...uint256(tokenId),
      address(currency),
      ...uint256(minProceeds),
    ],
  };
}
export function buildSetCollection(
  marketplace: string,
  collection: string,
  enabled: boolean,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "set_collection",
    calldata: [address(collection), bool(enabled)],
  };
}
export function buildSetCurrency(
  marketplace: string,
  currency: string,
  enabled: boolean,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "set_currency",
    calldata: [address(currency), bool(enabled)],
  };
}
export function buildSetPaused(
  marketplace: string,
  paused: boolean,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "set_paused",
    calldata: [bool(paused)],
  };
}
export function buildProposeAdmin(
  marketplace: string,
  admin: string,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "propose_admin",
    calldata: [address(admin)],
  };
}
export function buildAcceptAdmin(marketplace: string): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "accept_admin",
    calldata: [],
  };
}
export function buildConstructorCalldata(
  admin: string,
  feeBps: number,
  feeRecipient: string,
): string[] {
  const fee = unsigned(feeBps, 16, "fee");
  if (fee > 500n) throw new Error("Protocol fee cannot exceed 500 bps.");
  return [address(admin), fee.toString(), address(feeRecipient)];
}
export function buildGetOrder(marketplace: string, key: OrderKey): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "get_order",
    calldata: [address(key.maker, true), u64(key.nonce)],
  };
}
export function buildGetConfig(marketplace: string): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "get_config",
    calldata: [],
  };
}
export function buildQuoteTerms(
  marketplace: string,
  collection: string,
  tokenId: string,
  buyerDebit: string,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "quote_terms",
    calldata: [
      address(collection),
      ...uint256(tokenId),
      ...uint256(buyerDebit),
    ],
  };
}

function feeBps(value: number): string {
  const fee = unsigned(value, 16, "fee");
  if (fee > 500n) throw new Error("Protocol fee cannot exceed 500 bps.");
  return fee.toString();
}
export function buildSetFee(
  marketplace: string,
  rate: number,
  recipient: string,
): AccountCall {
  return {
    contractAddress: address(marketplace),
    entrypoint: "set_fee",
    calldata: [feeBps(rate), address(recipient)],
  };
}
