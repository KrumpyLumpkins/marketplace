import { formatAmount } from "@biblio/marketplace";
import { getAppMarketplaceClient } from "./app-client";
export function configureCurrencyDecimals(
  currencies: Array<{ address: string; decimals: number; symbol?: string }>,
) {
  getAppMarketplaceClient().currencies.configure(
    currencies.map((c) => ({ ...c, symbol: c.symbol ?? c.address })),
  );
}
export function formatCurrencyAmount(
  amount: string | bigint | undefined,
  currency?: string,
  decimals?: number,
) {
  if (amount === undefined) return "—";
  return formatAmount(
    amount,
    decimals ??
      (currency
        ? getAppMarketplaceClient().currencies.get(currency)?.decimals
        : undefined) ??
      18,
  );
}
