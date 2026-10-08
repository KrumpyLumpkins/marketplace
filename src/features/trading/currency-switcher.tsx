"use client";

import { useEffect, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { InfoTip } from "@/components/marketplace/info-tip";
import { useMarketConfig } from "@/lib/marketplace/react";
import { sameCurrency, useMarketCurrency } from "@/lib/marketplace/currency-store";
import { getTokenIconUrl, getTokenSymbol } from "@/lib/marketplace/token-display";
import { useWalletBalances, WALLET_TOKEN_ADDRESSES } from "@/lib/marketplace/use-wallet-balances";
import { cn } from "@/lib/utils";

export type CurrencyOption = {
  address: string;
  symbol: string;
  decimals: number;
};

export const CURRENCY_HELP =
  "Listings and offers are priced in one currency each. Choose which currency to browse: floors, listings, offers and statistics follow it, and new orders default to it.";

/** The configured market currencies, with the remembered selection kept valid. */
export function useMarketCurrencyOptions(override?: CurrencyOption[]) {
  const config = useMarketConfig();
  const currency = useMarketCurrency((state) => state.currency);
  const setCurrency = useMarketCurrency((state) => state.setCurrency);
  const options = useMemo<CurrencyOption[]>(
    () => override ?? config.data?.currencies ?? [],
    [override, config.data?.currencies],
  );

  useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((option) => sameCurrency(option.address, currency))) {
      setCurrency(options[0].address);
    }
  }, [currency, options, setCurrency]);

  const selected = options.find((option) => sameCurrency(option.address, currency)) ?? options[0] ?? null;
  return { options, currency, selected, setCurrency };
}

function CurrencyIcon({ address, symbol, size = 16 }: { address: string; symbol: string; size?: number }) {
  const icon = getTokenIconUrl(address);
  if (!icon) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary"
        style={{ width: size, height: size }}
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden
      className="shrink-0 rounded-full bg-[color:var(--realm-surface-slate)] object-cover ring-1 ring-[color:var(--realm-border-etched)]"
      height={size}
      src={icon}
      width={size}
    />
  );
}

function balanceKeyFor(address: string): keyof typeof WALLET_TOKEN_ADDRESSES | null {
  for (const [key, value] of Object.entries(WALLET_TOKEN_ADDRESSES)) {
    if (sameCurrency(value, address)) return key as keyof typeof WALLET_TOKEN_ADDRESSES;
  }
  return null;
}

function WalletBalanceHint({ address, symbol }: { address: string; symbol: string }) {
  const { address: wallet } = useAccount();
  const balances = useWalletBalances(wallet);
  const key = balanceKeyFor(address);
  if (!wallet || !key) return null;
  const balance = balances[key];
  return (
    <span className="text-xs text-muted-foreground" data-testid="currency-balance">
      Balance{" "}
      <span className="font-mono tabular-nums text-foreground">
        {balance.formatted ?? (balance.isLoading ? "…" : "—")}
      </span>{" "}
      {symbol}
    </span>
  );
}

type CurrencySwitcherProps = {
  /** Explicit options (tests and stories); production reads the market configuration. */
  currencies?: CurrencyOption[];
  /** Show the connected wallet's balance in the selected currency. */
  showBalance?: boolean;
  /** Visible caption next to the control. */
  label?: string;
  /** Hide the explainer button. */
  hideHelp?: boolean;
  className?: string;
};

/**
 * Segmented market-currency control. Replaces the bare select: every option
 * shows its token mark, the active choice is unmistakable, arrow keys move
 * between options, and the connected wallet's balance sits beside it.
 */
export function CurrencySwitcher({
  currencies,
  showBalance = false,
  label = "Currency",
  hideHelp = false,
  className,
}: CurrencySwitcherProps) {
  const { options, selected, setCurrency } = useMarketCurrencyOptions(currencies);

  if (options.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)} data-testid="currency-switcher">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground" id="market-currency-label">
          {label}
        </span>
        {hideHelp ? null : <InfoTip label="About market currency" text={CURRENCY_HELP} />}
      </div>
      <ToggleGroupPrimitive.Root
        type="single"
        aria-labelledby="market-currency-label"
        value={selected?.address ?? ""}
        onValueChange={(value) => {
          if (value) setCurrency(value);
        }}
        className="inline-flex items-center rounded-[8px] border border-[color:var(--realm-border-etched)] bg-[color:var(--realm-surface-iron)]/80 p-0.5"
      >
        {options.map((option) => {
          const symbol = option.symbol || getTokenSymbol(option.address);
          const active = sameCurrency(option.address, selected?.address);
          return (
            <ToggleGroupPrimitive.Item
              key={option.address}
              value={option.address}
              aria-label={`${symbol}${active ? " (selected)" : ""}`}
              className={cn(
                "inline-flex h-9 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <CurrencyIcon address={option.address} symbol={symbol} />
              <span>{symbol}</span>
              {active ? <Check aria-hidden className="size-3" /> : null}
            </ToggleGroupPrimitive.Item>
          );
        })}
      </ToggleGroupPrimitive.Root>
      {showBalance && selected ? (
        <WalletBalanceHint address={selected.address} symbol={selected.symbol || getTokenSymbol(selected.address)} />
      ) : null}
    </div>
  );
}
