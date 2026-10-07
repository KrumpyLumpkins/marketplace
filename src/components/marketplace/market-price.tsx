import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
/** Amounts are base units unless already formatted by the collection adapter. */
export function MarketPrice({
  amount,
  currency,
  formatted = false,
  empty = "Not listed",
}: {
  amount?: string | null;
  currency?: string | null;
  formatted?: boolean;
  empty?: string;
}) {
  if (amount == null)
    return <span className="text-muted-foreground">{empty}</span>;
  const value = formatted
    ? amount
    : formatCurrencyAmount(amount, currency ?? undefined);
  return (
    <span className="break-all tabular-nums">
      <span>{value}</span>{" "}
      <span>
        {currency ? getTokenSymbol(currency) : "currency unavailable"}
      </span>
    </span>
  );
}
