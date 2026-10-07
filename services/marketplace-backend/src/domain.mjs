/** Lossless values and settlement rules shared by backend interfaces. */
export class ApiError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
export const MAX_U256 = (1n << 256n) - 1n;
export function uint(value, bits = 256) {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    throw new ApiError(
      "INVALID_INTEGER",
      "Expected a lossless unsigned integer.",
    );
  if (
    !["string", "number", "bigint"].includes(typeof value) ||
    (typeof value === "string" && !/^(?:0[xX][\da-fA-F]+|\d+)$/.test(value))
  )
    throw new ApiError(
      "INVALID_INTEGER",
      "Expected an unsigned decimal or hex integer.",
    );
  const n = BigInt(value);
  if (n < 0n || n >= 1n << BigInt(bits))
    throw new ApiError("INVALID_INTEGER", `Integer exceeds u${bits}.`);
  return n.toString();
}
export function address(value) {
  const n = BigInt(uint(value));
  if (n >= (1n << 251n) - 256n)
    throw new ApiError("INVALID_ADDRESS", "Invalid Starknet contract address.");
  return `0x${n.toString(16).padStart(64, "0")}`;
}
export function allocations(price, feeBps, royalty) {
  const p = BigInt(uint(price)),
    r = BigInt(uint(royalty)),
    b = BigInt(uint(feeBps, 16));
  if (p === 0n || b > 500n)
    throw new ApiError(
      "INVALID_TERMS",
      "Price must be positive and fee at most 500 bps.",
    );
  const f = (p / 10000n) * b + ((p % 10000n) * b) / 10000n;
  if (f + r >= p)
    throw new ApiError(
      "INVALID_TERMS",
      "Fees must leave positive seller proceeds.",
    );
  return {
    buyerDebit: p.toString(),
    protocolFee: f.toString(),
    royaltyAmount: r.toString(),
    sellerProceeds: (p - f - r).toString(),
  };
}
export function orderKey(chain, marketplace, maker, nonce) {
  if (!["SN_MAIN", "SN_SEPOLIA", "LOCAL"].includes(chain))
    throw new ApiError("INVALID_CHAIN", "Unknown chain.");
  return [chain, address(marketplace), address(maker), uint(nonce, 64)].join(
    ":",
  );
}
export function evaluateOrder(
  order,
  { now = Math.floor(Date.now() / 1000), buyer, owner, approved, balance } = {},
) {
  if (!order) return "missing";
  if (order.state !== "open") return order.state;
  if (BigInt(order.expiry) <= BigInt(now)) return "expired";
  if (order.kind === "listing") {
    if (buyer && address(buyer) === address(order.maker)) return "own_listing";
    if (owner && address(owner) !== address(order.maker)) return "transferred";
    if (approved === false) return "unapproved";
  } else if (
    balance !== undefined &&
    BigInt(balance) < BigInt(order.buyerDebit)
  )
    return "unfunded";
  return "available";
}
export function u256Felts(value) {
  const n = BigInt(uint(value));
  return [(n & ((1n << 128n) - 1n)).toString(), (n >> 128n).toString()];
}
export function fromU256(low, high) {
  return (
    BigInt(uint(low, 128)) +
    (BigInt(uint(high, 128)) << 128n)
  ).toString();
}
export function numericKey(value) {
  return Buffer.from(BigInt(uint(value)).toString(16).padStart(64, "0"), "hex");
}
export function boundedInteger(value, fallback = 50, max = 100) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new ApiError("INVALID_QUERY", `Expected integer 1–${max}.`);
  return n;
}
