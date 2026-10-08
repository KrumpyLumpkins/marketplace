"use client";
import { useQuery, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import type { ApiCollection, ApiOrder, ApiPage } from "@/lib/marketplace/types";

/** Shape returned by `GET /collections/{address}/stats`. Amounts are base-unit strings. */
export type CollectionStats = {
  venue?: string;
  days: number;
  periodStart?: number;
  periodEnd?: number;
  periodBasis?: string;
  byCurrency: Array<{
    currency: string;
    volume: string;
    sales: number;
    history: Array<{ timestamp: number; price: string; tokenId?: string }>;
  }>;
  floors: Array<{ currency: string; symbol?: string; price: string }>;
  floorHistory?: Array<{
    collection?: string;
    currency: string;
    price: string | null;
    timestamp: number;
    block?: number;
  }>;
  historyLimit?: number;
};

export type ActivityEvent = {
  id: string;
  type: string;
  kind?: "listing" | "token_offer" | "collection_offer";
  collection?: string;
  tokenId?: string | null;
  currency?: string;
  buyerDebit?: string;
  sellerProceeds?: string;
  maker?: string;
  buyer?: string;
  seller?: string;
  from?: string;
  to?: string;
  expiry?: string;
  provenance: {
    blockNumber?: number;
    blockHash?: string;
    transactionHash?: string;
    eventIndex?: number;
    timestamp: number;
  };
};

export type ActivityFilter = "all" | "sales" | "listings" | "offers" | "transfers";

const ACTIVITY_TYPES: Record<Exclude<ActivityFilter, "all">, string> = {
  sales: "order_filled",
  listings: "order_created",
  offers: "order_created",
  transfers: "transfer",
};

export const STATS_PERIODS = [1, 7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export function useCollectionStatsQuery(
  address: string,
  days: number,
  currency?: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["owned", "stats", address, days, currency ?? "all"],
    queryFn: () =>
      marketplaceRequest<CollectionStats>(`/collections/${address}/stats`, {
        days,
        currency,
      }),
    enabled: !!address && options.enabled !== false,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useCollectionSummaryQuery(address: string) {
  return useQuery({
    queryKey: ["owned", "collection-summary", address],
    queryFn: () => marketplaceRequest<ApiCollection>(`/collections/${address}`),
    enabled: !!address,
    staleTime: 30_000,
  });
}

/** Open offers (token and collection) for a collection, highest first. */
export function useCollectionOffersQuery(
  address: string,
  options: { currency?: string; tokenMatch?: string; limit?: number; enabled?: boolean } = {},
) {
  return useInfiniteQuery<ApiPage<ApiOrder>>({
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    queryKey: [
      "owned",
      "collection-offers",
      address,
      options.currency ?? "all",
      options.tokenMatch ?? "",
      options.limit ?? 25,
    ],
    queryFn: ({ pageParam }) =>
      marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/offers`, {
        state: "open",
        currency: options.currency,
        tokenMatch: options.tokenMatch,
        limit: options.limit ?? 25,
        cursor: pageParam,
      }),
    enabled: !!address && options.enabled !== false,
    staleTime: 15_000,
  });
}

/** The highest open offer for a collection in one currency, or null. */
export function useTopOfferQuery(address: string, currency: string | undefined) {
  return useQuery({
    queryKey: ["owned", "top-offer", address, currency ?? "none"],
    queryFn: async () => {
      const page = await marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/offers`, {
        state: "open",
        currency,
        limit: 1,
      });
      return page.items[0] ?? null;
    },
    enabled: !!address && !!currency,
    staleTime: 15_000,
  });
}

/** Listings in one currency, cheapest first, for depth and floor derivations. */
export function useCollectionListingsPageQuery(
  address: string,
  currency: string | undefined,
  limit = 100,
) {
  return useQuery({
    queryKey: ["owned", "listings-depth", address, currency ?? "none", limit],
    queryFn: () =>
      marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/listings`, {
        currency,
        limit,
      }),
    enabled: !!address && !!currency,
    staleTime: 15_000,
  });
}

export function useCollectionActivityQuery(
  address: string,
  filter: ActivityFilter,
  options: { limit?: number; enabled?: boolean } = {},
) {
  const type = filter === "all" ? undefined : ACTIVITY_TYPES[filter];
  return useInfiniteQuery<ApiPage<ActivityEvent>>({
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    queryKey: ["owned", "collection-activity", address, filter, options.limit ?? 30],
    queryFn: ({ pageParam }) =>
      marketplaceRequest<ApiPage<ActivityEvent>>(`/collections/${address}/activity`, {
        type,
        limit: options.limit ?? 30,
        cursor: pageParam,
      }),
    enabled: !!address && options.enabled !== false,
    staleTime: 15_000,
  });
}

const DISPLAY_TYPES = new Set(["order_filled", "order_created", "order_cancelled", "transfer"]);

/** Keep only trading and ownership events; policy and admin noise is dropped. Listings and offers share a type, so refine by kind. */
export function filterActivityEvents(events: ActivityEvent[], filter: ActivityFilter) {
  return events.filter((event) => {
    if (!DISPLAY_TYPES.has(event.type)) return false;
    if (filter === "listings") return event.type === "order_created" && event.kind === "listing";
    if (filter === "offers") return event.type === "order_created" && event.kind !== "listing";
    return true;
  });
}
