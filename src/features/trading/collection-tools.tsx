"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { useMarketConfig } from "@/lib/marketplace/react";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderComposer } from "./order-composer";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
type Stats = {
  days: number;
  byCurrency: Array<{
    currency: string;
    volume: string;
    sales: number;
    history: Array<{ timestamp: number; price: string }>;
  }>;
  floorHistory?: Array<{
    timestamp: number;
    price: string | null;
    currency: string;
  }>;
  floors: Array<{ currency: string; price: string }>;
};
export function CollectionTools({ address }: { address: string }) {
  const { currency, setCurrency } = useMarketCurrency();
  const config = useMarketConfig();
  const [offer, setOffer] = useState(false);
  const stats = useQuery({
    queryKey: ["owned", "stats", address, currency],
    queryFn: () =>
      marketplaceRequest<Stats>(`/collections/${address}/stats`, {
        currency,
        days: 7,
      }),
  });
  const selected = stats.data?.byCurrency.find(
    (c) => BigInt(c.currency) === BigInt(currency),
  );
  const symbol =
    config.data?.currencies.find((c) => BigInt(c.address) === BigInt(currency))
      ?.symbol ?? "";
  const values = selected?.history.slice(-40) ?? [];
  const max = values.reduce(
    (m, p) => (BigInt(p.price) > m ? BigInt(p.price) : m),
    1n,
  );
  const points = values
    .map(
      (p, i) =>
        `${values.length === 1 ? 50 : (i * 100) / (values.length - 1)},${38 - Number((BigInt(p.price) * 30n) / max)}`,
    )
    .join(" ");
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="sr-only">Trade currency</span>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="min-h-11 w-24" aria-label="Trade currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.data?.currencies.map((c) => (
                <SelectItem key={c.address} value={c.address}>
                  {c.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => setOffer(!offer)}>
          Make collection offer
        </Button>
      </div>
      {offer && (
        <Card>
          <CardContent className="p-4">
            <OrderComposer collection={address} kind="collection_offer" />
          </CardContent>
        </Card>
      )}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Market statistics · 7 days</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              7 UTC days · marketplace volume
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl">
            {stats.isPending
              ? "…"
              : stats.isError
                ? "Unavailable"
                : formatCurrencyAmount(selected?.volume ?? "0", currency)}{" "}
            {symbol}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              7-day sales
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl">
            {stats.isPending
              ? "…"
              : stats.isError
                ? "Unavailable"
                : (selected?.sales ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Recent sale prices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {values.length ? (
              <svg
                viewBox="0 0 100 40"
                className="h-12 w-full text-primary"
                role="img"
                aria-label={`Recent prices in ${symbol}`}
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">
                {stats.isError
                  ? "Market history unavailable."
                  : "No sales in this period."}
              </p>
            )}
            {!!stats.data?.floorHistory?.length && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Floor history</summary>
                <ul className="mt-2 space-y-1">
                  {stats.data.floorHistory
                    .slice(-8)
                    .reverse()
                    .map((point, i) => (
                      <li key={i}>
                        {new Date(point.timestamp * 1000).toLocaleString()}:{" "}
                        {point.price == null
                          ? "No active listings"
                          : `${formatCurrencyAmount(point.price, point.currency)} ${symbol}`}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      </div></details>
    </section>
  );
}
