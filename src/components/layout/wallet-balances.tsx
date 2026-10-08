"use client";

import { Check } from "lucide-react";
import { useWalletBalances, WALLET_TOKEN_ADDRESSES } from "@/lib/marketplace/use-wallet-balances";
import { getTokenIconUrl, getTokenSymbol } from "@/lib/marketplace/token-display";
import { sameCurrency, useMarketCurrency } from "@/lib/marketplace/currency-store";
import { cn } from "@/lib/utils";

const BALANCE_TOKENS = [
  { key: "strk", address: WALLET_TOKEN_ADDRESSES.strk },
  { key: "lords", address: WALLET_TOKEN_ADDRESSES.lords },
  { key: "survivor", address: WALLET_TOKEN_ADDRESSES.survivor },
] as const;

type BalanceKey = (typeof BALANCE_TOKENS)[number]["key"];

type WalletBalancesProps = {
  walletAddress: string;
};

/**
 * Wallet balances double as the market-currency picker: the row with the check
 * is the currency the marketplace is browsing in, and any row can be chosen.
 */
export function WalletBalances({ walletAddress }: WalletBalancesProps) {
  const balances = useWalletBalances(walletAddress);
  const currency = useMarketCurrency((state) => state.currency);
  const setCurrency = useMarketCurrency((state) => state.setCurrency);

  return (
    <div className="space-y-0.5 px-1 py-1.5" role="radiogroup" aria-label="Wallet balances and market currency">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Balances · tap to browse in
      </p>
      {BALANCE_TOKENS.map(({ key, address }) => {
        const balance = balances[key as BalanceKey];
        const iconUrl = getTokenIconUrl(address);
        const symbol = getTokenSymbol(address);
        const displayBalance = balance.formatted ?? (balance.isLoading ? "…" : "—");
        const active = sameCurrency(address, currency);

        return (
          <button
            key={address}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${symbol} balance ${displayBalance}${active ? ", market currency" : ""}`}
            onClick={() => setCurrency(address)}
            className={cn(
              "flex min-h-10 w-full items-center justify-between gap-4 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-primary/10",
            )}
          >
            <span className="flex items-center gap-2">
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  aria-hidden
                  className="size-5 shrink-0 rounded-full object-cover"
                  src={iconUrl}
                />
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">
                  {symbol[0]}
                </span>
              )}
              <span className={cn("text-xs font-medium", active && "text-primary")}>{symbol}</span>
            </span>
            <span className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
              {displayBalance}
              <Check
                aria-hidden
                className={cn("size-3.5 text-primary", active ? "opacity-100" : "opacity-0")}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
