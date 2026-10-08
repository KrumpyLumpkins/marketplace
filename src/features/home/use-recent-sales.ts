"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchCollectionTokens, marketplaceRequest } from "@/lib/marketplace/api-client";
import type { ActivityEvent } from "@/lib/marketplace/market-data";
import type { ApiPage } from "@/lib/marketplace/types";
import { formatRelativeTime } from "@/lib/marketplace/time-format";
import { tokenId as tokenKey } from "@/lib/marketplace/token-display";
import type { TrendingToken } from "./types";

/** The latest sales of one collection as token cards, newest first. */
export function useRecentSales(address: string | null | undefined, limit = 8) {
  return useQuery({
    queryKey: ["owned", "recent-sales", address, limit],
    queryFn: async (): Promise<TrendingToken[]> => {
      const page = await marketplaceRequest<ApiPage<ActivityEvent>>(`/collections/${address}/activity`, {
        type: "order_filled",
        limit,
      });
      const sales = page.items.filter((event) => event.tokenId);
      if (sales.length === 0) return [];
      const tokenIds = [...new Set(sales.map((event) => String(event.tokenId)))];
      const tokens = await fetchCollectionTokens({ address: address!, tokenIds, limit: tokenIds.length });
      const byId = new Map(tokens.page.tokens.map((token) => [tokenKey(token), token]));
      return sales.flatMap((sale) => {
        const token = byId.get(String(sale.tokenId));
        if (!token) return [];
        return [
          {
            token,
            href: `/collections/${address}/${sale.tokenId}`,
            price: sale.buyerDebit ?? null,
            currency: sale.currency ?? null,
            note: `Sold ${formatRelativeTime(sale.provenance.timestamp)}`,
          },
        ];
      });
    },
    enabled: !!address,
    staleTime: 30_000,
  });
}
