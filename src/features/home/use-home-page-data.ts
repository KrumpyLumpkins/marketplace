"use client";
import { useQuery } from "@tanstack/react-query";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import type { ApiCollection } from "@/lib/marketplace/types";
import type {
  CollectionCardData,
  FeaturedCollection,
  TrendingToken,
} from "./types";
import { getCollectionBannerImage } from "@/lib/marketplace/collection-banners";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
export function useHomePageData() {
  const currency = useMarketCurrency((s) => s.currency);
  const query = useQuery({
    queryKey: ["owned", "collections"],
    queryFn: () => marketplaceRequest<ApiCollection[]>("/collections"),
  });
  const collectionCards: CollectionCardData[] = (query.data ?? []).map((c) => ({
    address: c.address,
    name: c.name,
    imageUrl: c.image ?? getCollectionBannerImage(c.name),
    floorPrice: formatCurrencyAmount(
      c.floorByCurrency.find((f) => BigInt(f.currency) === BigInt(currency))
        ?.price,
      currency,
    ),
    floorCurrency: currency,
    totalSupply: c.tokenCount,
    listingCount: c.listingCount,
  }));
  return {
    featuredCollection: (collectionCards[0] ??
      null) as FeaturedCollection | null,
    collectionCards,
    trendingTokens: [] as TrendingToken[],
    isLoading: query.isPending,
    isError: query.isError,
    refetch:query.refetch,
  };
}
