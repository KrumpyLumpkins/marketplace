export type IntegerInput = string | bigint | number;
export function unsigned(
  value: IntegerInput,
  bits: number,
  label = "integer",
): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Error(
      `${label} requires a safe integer or a decimal/hex string.`,
    );
  if (typeof value === "string" && !/^(?:0x[\da-f]+|\d+)$/i.test(value))
    throw new Error(`Invalid ${label}.`);
  if (!["string", "number", "bigint"].includes(typeof value))
    throw new Error(`Invalid ${label}.`);
  const n = BigInt(value);
  if (n < 0n || n >= 1n << BigInt(bits))
    throw new Error(`${label} exceeds u${bits}.`);
  return n;
}
export function address(value: string, allowZero = false): string {
  if (typeof value !== "string") throw new Error("Address must be a string.");
  const n = unsigned(value, 251, "address");
  if (!allowZero && n === 0n) throw new Error("A nonzero address is required.");
  return value;
}
export function u64(value: IntegerInput, positive = false): string {
  const n = unsigned(value, 64, "u64 integer");
  if (positive && n === 0n) throw new Error("Order nonce must be positive.");
  return n.toString();
}
export function bool(value: boolean): string {
  if (typeof value !== "boolean") throw new Error("Expected a boolean.");
  return value ? "1" : "0";
}
export function decodeU256(low: string, high: string): string {
  return (
    unsigned(low, 128, "u256 low limb") +
    (unsigned(high, 128, "u256 high limb") << 128n)
  ).toString();
}
