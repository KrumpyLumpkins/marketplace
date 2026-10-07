export type Currency = { address: string; symbol: string; decimals: number };
export function formatAmount(
  amount: string | bigint,
  decimals: number,
): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error("Invalid currency decimals.");
  const n = BigInt(amount),
    absolute = n < 0n ? -n : n,
    divisor = 10n ** BigInt(decimals);
  const fraction = (absolute % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${n < 0n ? "-" : ""}${absolute / divisor}${fraction ? "." + fraction : ""}`;
}
export function createCurrencyRegistry() {
  const currencies = new Map<string, Currency>();
  return {
    configure(values: Currency[]) {
      for (const c of values) {
        formatAmount("0", c.decimals);
        currencies.set(BigInt(c.address).toString(), { ...c });
      }
    },
    get(address: string) {
      return currencies.get(BigInt(address).toString());
    },
    format(amount: string | bigint, address: string) {
      const c = currencies.get(BigInt(address).toString());
      if (!c) throw new Error("Currency metadata is required.");
      return formatAmount(amount, c.decimals);
    },
  };
}
