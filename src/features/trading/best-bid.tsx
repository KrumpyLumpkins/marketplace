"use client";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import type { ApiOrder } from "@/lib/marketplace/types";
import { Button } from "@/components/ui/button";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
import { AcceptOffer } from "./accept-offer";
type Bid = {
  best: null | {
    order: ApiOrder;
    sellerProceeds: string;
    checkedBlock: number;
  };
  checked: number;
  complete: boolean;
  label: string;
};
export function BestBid({
  collection,
  tokenId,
  isOwner,
}: {
  collection: string;
  tokenId: string;
  isOwner: boolean;
}) {
  const [enabled, setEnabled] = useState(false),
    currency = useMarketCurrency((s) => s.currency);
  const query = useQuery({
    queryKey: ["owned", "best-bid", collection, tokenId, currency],
    queryFn: () =>
      marketplaceRequest<Bid>(`/tokens/${collection}/${tokenId}/best-bid`, {
        currency,
      }),
    enabled,
    retry: false,
    staleTime: 15000,
  });
  return (
    <div className="space-y-2 rounded border p-3">
      <Button
        variant="outline"
        size="sm"
        disabled={query.isFetching}
        onClick={() => {
          setEnabled(true);
          if (enabled) void query.refetch();
        }}
      >
        {query.isFetching
          ? "Checking offer funding…"
          : "Find best funded offer"}
      </Button>
      {query.error && (
        <p role="alert" className="text-xs text-destructive">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <>
          <p className="text-sm">
            {query.data.best
              ? `${query.data.label}: ${formatCurrencyAmount(query.data.best.sellerProceeds, currency)} ${getTokenSymbol(currency)} seller proceeds`
              : "No executable offer found in checked orders."}
          </p>
          <p className="text-xs text-muted-foreground">
            {query.data.checked} checked
            {query.data.complete
              ? ""
              : " · search limit reached; more offers may exist"}
            {query.data.best ? ` · block ${query.data.best.checkedBlock}` : ""}
          </p>
          {isOwner && query.data.best && (
            <AcceptOffer order={query.data.best.order} tokenId={tokenId} />
          )}
        </>
      )}
    </div>
  );
}
