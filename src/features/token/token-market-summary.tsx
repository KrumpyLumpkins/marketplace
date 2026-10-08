"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@/components/marketplace/info-tip";
import { MarketPrice } from "@/components/marketplace/market-price";
import { sameCurrency } from "@/lib/marketplace/currency-store";
import type { ApiOrder } from "@/lib/marketplace/types";
import type { TokenActivityItem } from "./token-activity";

export type MarketAmount = { amount: string; currency: string };

export type TokenMarketSummaryProps = {
  /** Cheapest open listing in base units, including fees. */
  price?: string | null;
  currency?: string | null;
  topOffer?: MarketAmount | null;
  lastSale?: MarketAmount | null;
  /** Open listings for this token; mentioned when more than one is live. */
  listedCount?: number;
};

const HELP = {
  price:
    "The cheapest open listing for this token. It includes marketplace fees and royalties; network fees are separate.",
  topOffer:
    "The highest open offer for this token or its collection. Funds stay in the bidder's wallet and are checked again when the owner accepts.",
  lastSale: "The most recent sale of this token filled on this marketplace.",
} as const;

function parseAmount(value: string) {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Highest open offer, compared within one currency: the preferred currency
 * when any offer uses it, otherwise the currency of the leading offer.
 */
export function pickTopOffer(
  orders: ApiOrder[],
  preferredCurrency?: string | null,
): MarketAmount | null {
  const offers = orders.filter(
    (order) => order.kind !== "listing" && parseAmount(order.buyerDebit) !== null,
  );
  if (offers.length === 0) return null;

  const preferred = preferredCurrency
    ? offers.filter((order) => sameCurrency(order.currency, preferredCurrency))
    : [];
  const pool =
    preferred.length > 0
      ? preferred
      : offers.filter((order) => sameCurrency(order.currency, offers[0].currency));

  let best = pool[0];
  let bestAmount = parseAmount(best.buyerDebit) ?? 0n;
  for (const order of pool) {
    const amount = parseAmount(order.buyerDebit) ?? 0n;
    if (amount > bestAmount) {
      best = order;
      bestAmount = amount;
    }
  }
  return { amount: best.buyerDebit, currency: best.currency };
}

/** The most recent fill carrying an amount, whatever order the events arrive in. */
export function pickLastSale(items: TokenActivityItem[]): MarketAmount | null {
  let latest: TokenActivityItem | null = null;
  for (const item of items) {
    if (item.type !== "order_filled" || !item.buyerDebit || !item.currency) continue;
    if (!latest || item.provenance.timestamp > latest.provenance.timestamp) {
      latest = item;
    }
  }
  return latest && latest.buyerDebit && latest.currency
    ? { amount: latest.buyerDebit, currency: latest.currency }
    : null;
}

function Tile({
  label,
  help,
  testId,
  children,
  note,
}: {
  label: string;
  help: string;
  testId: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="realm-stat-pill min-w-0 px-3 py-2.5">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        <InfoTip label={`About ${label.toLowerCase()}`} text={help} />
      </dt>
      <dd
        data-testid={testId}
        className="mt-1 min-w-0 text-lg font-semibold leading-tight text-primary"
      >
        {children}
      </dd>
      {note ? (
        <dd className="mt-0.5 text-[11px] text-muted-foreground">{note}</dd>
      ) : null}
    </div>
  );
}

/** Three at-a-glance market figures for one token. Tiles wrap on narrow screens. */
export function TokenMarketSummary({
  price,
  currency,
  topOffer,
  lastSale,
  listedCount,
}: TokenMarketSummaryProps) {
  return (
    <dl
      data-testid="token-market-summary"
      className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2"
    >
      <Tile
        label="Price"
        help={HELP.price}
        testId="market-summary-price"
        note={
          listedCount !== undefined && listedCount > 1
            ? `${listedCount} open listings`
            : undefined
        }
      >
        <MarketPrice amount={price} currency={currency} empty="Not listed" />
      </Tile>
      <Tile label="Top offer" help={HELP.topOffer} testId="market-summary-top-offer">
        <MarketPrice
          amount={topOffer?.amount}
          currency={topOffer?.currency}
          empty="No offers"
        />
      </Tile>
      <Tile label="Last sale" help={HELP.lastSale} testId="market-summary-last-sale">
        <MarketPrice
          amount={lastSale?.amount}
          currency={lastSale?.currency}
          empty="No sales yet"
        />
      </Tile>
    </dl>
  );
}
