import { readFileSync } from "node:fs";
import { address, uint, fromU256, orderKey, ApiError } from "./domain.mjs";
export const SELECTORS = JSON.parse(
  readFileSync(
    new URL("../../../config/marketplace/selectors.json", import.meta.url),
    "utf8",
  ),
);
const selectorNames = new Map(
  Object.entries(SELECTORS).map(([k, v]) => [BigInt(v).toString(), k]),
);
function reader(values) {
  let i = 0;
  const next = () => {
    if (i >= values.length)
      throw new ApiError("INVALID_EVENT", "Truncated event.");
    return values[i++];
  };
  return {
    felt: () => uint(next(), 252),
    addr: () => address(next()),
    int: (bits = 64) => uint(next(), bits),
    u256: () => fromU256(next(), next()),
    bool: () => {
      const n = uint(next(), 1);
      return n === "1";
    },
    end: () => {
      if (i !== values.length)
        throw new ApiError("INVALID_EVENT", "Unexpected event fields.");
    },
  };
}
export function readTerms(data) {
  const r = reader(data);
  const kind = ["unknown", "listing", "token_offer", "collection_offer"][
    Number(r.int(8))
  ];
  if (!kind || kind === "unknown")
    throw new ApiError("UNKNOWN_KIND", "Unknown order type.");
  const collection = r.addr(),
    rawToken = r.u256(),
    currency = r.addr(),
    buyerDebit = r.u256(),
    expiry = r.int(),
    royaltyCap = r.u256(),
    royaltyRecipient = r.addr(),
    royaltyAmount = r.u256(),
    feeBps = Number(r.int(16));
  if (feeBps > 500) throw new ApiError("INVALID_EVENT", "Fee exceeds cap.");
  r.end();
  return {
    kind,
    collection,
    tokenId: kind === "collection_offer" ? null : rawToken,
    currency,
    buyerDebit,
    expiry,
    royaltyCap,
    royaltyRecipient,
    royaltyAmount,
    feeBps,
  };
}
export function decodeEvent(raw, config) {
  if (!Array.isArray(raw.keys) || !raw.keys.length || !Array.isArray(raw.data))
    throw new ApiError("INVALID_EVENT", "Invalid event envelope.");
  const source = address(raw.from_address),
    name = selectorNames.get(BigInt(raw.keys[0]).toString());
  const market = config.marketplace && source === address(config.marketplace);
  if (market) {
    let e;
    if (["OrderCreated", "OrderCancelled", "OrderFilled"].includes(name)) {
      if (raw.keys.length !== 3)
        throw new ApiError("INVALID_EVENT", "Order event keys.");
      const maker = address(raw.keys[1]),
        nonce = uint(raw.keys[2], 64),
        key = orderKey(config.chain, config.marketplace, maker, nonce);
      if (name === "OrderCreated")
        e = {
          type: "order_created",
          key,
          maker,
          nonce,
          ...readTerms(raw.data),
        };
      else if (name === "OrderCancelled") {
        if (raw.data.length) throw new ApiError("INVALID_EVENT", "Cancel data");
        e = { type: "order_cancelled", key, maker, nonce };
      } else {
        const r = reader(raw.data);
        e = {
          type: "order_filled",
          key,
          maker,
          nonce,
          buyer: r.addr(),
          seller: r.addr(),
          collection: r.addr(),
          tokenId: r.u256(),
          currency: r.addr(),
          buyerDebit: r.u256(),
          sellerProceeds: r.u256(),
          protocolFee: r.u256(),
          feeRecipient: r.addr(),
          royaltyAmount: r.u256(),
          royaltyRecipient: r.addr(),
        };
        r.end();
      }
    } else {
      const r = reader(raw.data);
      if (name === "MarketplaceInitialized")
        e = {
          type: "initialized",
          version: Number(r.int(32)),
          admin: r.addr(),
          feeBps: Number(r.int(16)),
          feeRecipient: r.addr(),
          paused: false,
          marketplace: source,
        };
      else if (name === "FeePolicyChanged") {
        const feeBps = Number(r.int(16)),
          feeRecipient = r.addr();
        if (raw.keys.length !== 1 || feeBps > 500 || BigInt(feeRecipient) === 0n)
          throw new ApiError("INVALID_EVENT", "Invalid fee policy.");
        e = { type: "fee_policy_changed", feeBps, feeRecipient };
      } else if (name === "TradingChanged")
        e = { type: "trading_changed", paused: r.bool() };
      else if (name === "CollectionPolicyChanged") {
        if (raw.keys.length !== 2)
          throw new ApiError("INVALID_EVENT", "Policy key");
        e = {
          type: "collection_policy",
          address: address(raw.keys[1]),
          enabled: r.bool(),
          royalties: r.bool(),
        };
      } else if (name === "CurrencyPolicyChanged") {
        if (raw.keys.length !== 2)
          throw new ApiError("INVALID_EVENT", "Policy key");
        e = {
          type: "currency_policy",
          address: address(raw.keys[1]),
          enabled: r.bool(),
        };
      } else if (name === "AdminProposed")
        e = { type: "admin_proposed", admin: r.addr() };
      else if (name === "AdminTransferred")
        e = { type: "admin_transferred", previous: r.addr(), admin: r.addr() };
      else
        throw new ApiError(
          "UNKNOWN_MARKET_EVENT",
          `Unknown marketplace selector ${raw.keys[0]}`,
        );
      r.end();
    }
    return e;
  }
  if (!config.collections.some((c) => address(c.address) === source))
    return null;
  const r = reader([...raw.keys.slice(1), ...raw.data]);
  let e;
  if (name === "Transfer")
    e = {
      type: "transfer",
      collection: source,
      from: r.addr(),
      to: r.addr(),
      tokenId: r.u256(),
    };
  else if (name === "Approval")
    e = {
      type: "approval",
      collection: source,
      owner: r.addr(),
      spender: r.addr(),
      tokenId: r.u256(),
    };
  else if (name === "ApprovalForAll")
    e = {
      type: "operator_approval",
      collection: source,
      owner: r.addr(),
      operator: r.addr(),
      approved: r.bool(),
    };
  else if (name === "MetadataUpdate")
    e = { type: "metadata_update", collection: source, tokenId: r.u256() };
  else if (name === "BatchMetadataUpdate")
    e = {
      type: "metadata_update",
      collection: source,
      fromTokenId: r.u256(),
      toTokenId: r.u256(),
    };
  else return null;
  r.end();
  return e;
}
