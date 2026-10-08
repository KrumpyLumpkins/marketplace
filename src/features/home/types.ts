import type { NormalizedToken } from "@/lib/marketplace/types";

export type FeaturedCollection = {
  address: string;
  name: string;
  projectId?: string;
  imageUrl?: string | null;
  floorPrice?: string | null;
  floorCurrency?: string | null;
  totalSupply?: string | null;
  listingCount?: string | null;
};

export type TrendingToken = {
  token: NormalizedToken;
  href: string;
  price?: string | null;
  currency?: string | null;
  /** One-line context under the price, e.g. when it sold. */
  note?: string | null;
};

export type CollectionCardData = {
  address: string;
  name: string;
  projectId?: string;
  imageUrl?: string | null;
  /** Formatted floor in the market currency. */
  floorPrice?: string | null;
  /** Base-unit floor used for sorting. */
  floorRaw?: string | null;
  floorCurrency?: string | null;
  totalSupply?: string | null;
  listingCount?: string | null;
  verified?: boolean;
};
