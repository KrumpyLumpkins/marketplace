"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Clock3, HandCoins, Layers } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketPrice } from "@/components/marketplace/market-price";
import { formatRelativeExpiry } from "@/lib/marketplace/token-display";
import type { ApiOrder } from "@/lib/marketplace/types";
export function OfferList({
  orders,
  loading = false,
  error = false,
  hasMore = false,
  loadingMore = false,
  onRetry,
  onMore,
  renderAction,
  children,
}: {
  orders: ApiOrder[];
  loading?: boolean;
  error?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onRetry: () => void;
  onMore: () => void;
  renderAction?: (order: ApiOrder) => ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden border-[color:var(--realm-border-etched)]">
      <CardHeader className="gap-2 border-b pb-4">
        <div className="flex items-center gap-2">
          <CardTitle>Offers</CardTitle>
          {orders.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {orders.length}
              {hasMore ? "+" : ""}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs leading-relaxed">
          Funds stay in the bidder’s wallet and are checked again before
          acceptance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {children}
        {loading && orders.length === 0 && (
          <div role="status" aria-label="Loading offers" className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}
        <ul className="space-y-3" aria-label="Offers for this asset">
          {orders.map((order) => (
            <li
              key={order.id}
              className="min-w-0 rounded-xl border border-[color:var(--realm-border-etched)] bg-muted/20 p-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Offer amount
                  </p>
                  <p className="text-xl font-semibold text-primary">
                    <MarketPrice
                      amount={order.buyerDebit}
                      currency={order.currency}
                    />
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="gap-1.5 text-[11px] font-normal"
                >
                  {order.kind === "collection_offer" ? (
                    <Layers aria-hidden className="size-3" />
                  ) : (
                    <HandCoins aria-hidden className="size-3" />
                  )}
                  {order.kind === "collection_offer"
                    ? "Collection offer"
                    : "Token offer"}
                </Badge>
              </div>
              <div className="mt-4 flex flex-col items-stretch justify-between gap-3 border-t sm:flex-row sm:items-end border-border/60 pt-3">
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>
                    From{" "}
                    <Link
                      className="rounded font-mono text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      href={`/profile/${order.maker}`}
                      title={order.maker}
                    >
                      {order.maker.length > 16
                        ? `${order.maker.slice(0, 8)}…${order.maker.slice(-6)}`
                        : order.maker}
                    </Link>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock3 aria-hidden className="size-3" />
                    {formatRelativeExpiry(Number(order.expiry))}
                  </p>
                </div>
                {renderAction && (
                  <div className="w-full sm:w-auto [&_button]:min-h-11 [&_button]:w-full sm:[&_button]:w-auto">
                    {renderAction(order)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
            <p role="alert" className="text-sm text-muted-foreground">
              Offers are unavailable. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry offers
            </Button>
          </div>
        )}
        {!loading && !error && orders.length === 0 && (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed px-5 py-8 text-center">
            <HandCoins
              aria-hidden
              className="mb-1 size-6 text-muted-foreground"
            />
            <p className="text-sm font-medium">No offers yet</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              New token and collection offers will appear here.
            </p>
          </div>
        )}
        {hasMore && (
          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={loadingMore}
            onClick={onMore}
          >
            {loadingMore ? "Loading offers…" : "Load more offers"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
