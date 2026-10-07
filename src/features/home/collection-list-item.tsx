"use client";
import { MarketPrice } from "@/components/marketplace/market-price";

import { useMemo } from "react";
import Link from "next/link";
import {
  useCollectionQuery,
  useCollectionListingsQuery,
} from "@/lib/marketplace/hooks";
import { formatNumberish } from "@/lib/marketplace/token-display";
import { getCollectionBannerImage } from "@/lib/marketplace/collection-banners";
import { cheapestListingByTokenId } from "@/features/cart/listing-utils";
import { COLLECTION_LISTING_SAMPLE_LIMIT } from "@/lib/marketplace/query-limits";

type CollectionListItemProps = {
  address: string;
  name: string;
  projectId?: string;
  /** Pre-resolved image — if not provided, attempts banner lookup */
  imageUrl?: string | null;
};

function metadataImage(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const fields = metadata as Record<string, unknown>;
  const image = fields.image ?? fields.image_url;
  return typeof image === "string" && image.trim() ? image : null;
}

export function CollectionListItem({
  address,
  name,
  projectId,
  imageUrl: imageUrlProp,
}: CollectionListItemProps) {
  const collectionQuery = useCollectionQuery({
    address,
    projectId,
    fetchImages: true,
  });

  const listingsQuery = useCollectionListingsQuery({
    collection: address,
    projectId,
    limit: COLLECTION_LISTING_SAMPLE_LIMIT,
    verifyOwnership: false,
  });

  const cheapestListings = useMemo(
    () => cheapestListingByTokenId(listingsQuery.data),
    [listingsQuery.data],
  );

  const floor = useMemo(
    () =>
      [...cheapestListings.values()].reduce<
        | (typeof cheapestListings extends Map<string, infer V> ? V : never)
        | null
      >(
        (lowest, listing) =>
          !lowest || BigInt(listing.price) < BigInt(lowest.price)
            ? listing
            : lowest,
        null,
      ),
    [cheapestListings],
  );

  const totalSupply =
    formatNumberish(collectionQuery.data?.totalSupply) ?? null;
  const listingCount = Array.isArray(listingsQuery.data)
    ? String(listingsQuery.data.length)
    : null;

  const resolvedImage =
    imageUrlProp ??
    metadataImage(collectionQuery.data?.metadata) ??
    getCollectionBannerImage(name);

  const isLoading = collectionQuery.isLoading || listingsQuery.isLoading;

  return (
    <Link
      href={`/collections/${address}`}
      className="realm-panel group flex items-center gap-4 p-3 transition-all duration-200 hover:border-[color:var(--realm-border-strong)] hover:shadow-[0_0_18px_rgba(231,207,136,0.12)]"
    >
      {/* Collection image */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-[color:var(--realm-border-etched)] bg-muted">
        {resolvedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${name} preview`}
            src={resolvedImage}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(231,207,136,0.18),transparent_4rem),linear-gradient(145deg,#161b20,#070b0d)]">
            <span className="text-[10px] text-muted-foreground">&mdash;</span>
          </div>
        )}
      </div>

      {/* Collection info */}
      <div className="min-w-0 flex-1">
        <p className="realm-title truncate text-base transition-colors group-hover:text-primary">
          {name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {isLoading ? (
            <span className="inline-block h-3 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <>
              {floor ? (
                <span>
                  Floor{" "}
                  <span className="font-medium text-primary">
                    <MarketPrice
                      amount={floor.price}
                      currency={floor.currency}
                    />
                  </span>
                </span>
              ) : null}
              {totalSupply ? (
                <span>
                  Items{" "}
                  <span className="font-medium text-foreground">
                    {totalSupply}
                  </span>
                </span>
              ) : null}
              {listingCount ? (
                <span>
                  Listed{" "}
                  <span className="font-medium text-foreground">
                    {listingCount}
                  </span>
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg
        className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 4.5l7.5 7.5-7.5 7.5"
        />
      </svg>
    </Link>
  );
}
