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
};

export type CollectionCardData = {
  address: string;
  name: string;
  projectId?: string;
  imageUrl?: string | null;
  floorPrice?: string | null;
  floorCurrency?: string | null;
  totalSupply?: string | null;
  listingCount?: string | null;
};
