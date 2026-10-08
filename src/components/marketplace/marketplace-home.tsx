"use client";

import { GlobalSearch } from "@/features/trading/global-search";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { HeroBanner } from "@/features/home/hero-banner";
import { CollectionsTable } from "@/features/home/collections-table";
import { PromotedCollection } from "@/features/home/promoted-collection";
import { TrendingTokensSection } from "@/features/home/trending-tokens-section";
import { useHomePageData } from "@/features/home/use-home-page-data";
import { useRecentSales } from "@/features/home/use-recent-sales";
import { CurrencySwitcher } from "@/features/trading/currency-switcher";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import { matchesHomeSearch, normalizeHomeSearchQuery } from "@/lib/marketplace/home-search";

export function MarketplaceHome() {
  const searchParams = useSearchParams();
  const query = normalizeHomeSearchQuery(searchParams.get("q") ?? "");
  const currency = useMarketCurrency((state) => state.currency);
  const {
    featuredCollection,
    collectionCards,
    isLoading,
    isError,
    refetch,
  } = useHomePageData();
  const recentSales = useRecentSales(featuredCollection?.address);

  const filteredCollections = useMemo(
    () =>
      collectionCards.filter((collection) =>
        matchesHomeSearch(query, [collection.name, collection.address]),
      ),
    [collectionCards, query],
  );

  // The spotlight shows the second configured collection so the hero and the panel never repeat.
  const promotedCollection = useMemo(
    () => collectionCards.find((c) => c.address !== featuredCollection?.address) ?? null,
    [collectionCards, featuredCollection],
  );

  if (isError)
    return (
      <main className="market-page">
        <p role="alert" className="text-muted-foreground">
          Unable to load marketplace collections.
        </p>
        <button className="mt-3 min-h-11 text-primary underline underline-offset-4" onClick={() => void refetch?.()}>
          Retry
        </button>
      </main>
    );
  if (query) return <GlobalSearch query={query} />;

  if (!isLoading && collectionCards.length === 0) {
    return (
      <main data-testid="marketplace-home" className="market-page flex-1">
        <p className="text-sm text-muted-foreground font-mono">
          <span className="mr-1 text-primary">$</span>
          No collections configured
        </p>
      </main>
    );
  }

  return (
    <main data-testid="marketplace-home" className="market-page flex-1 space-y-6">
      <HeroBanner
        name={featuredCollection?.name ?? "Featured Collection"}
        address={featuredCollection?.address ?? ""}
        imageUrl={featuredCollection?.imageUrl}
        floorPrice={featuredCollection?.floorPrice}
        floorCurrency={featuredCollection?.floorCurrency}
        totalSupply={featuredCollection?.totalSupply}
        listingCount={featuredCollection?.listingCount}
        isLoading={isLoading}
      />

      {featuredCollection && (recentSales.isPending || (recentSales.data?.length ?? 0) > 0) ? (
        <TrendingTokensSection
          title={`Recent sales in ${featuredCollection.name}`}
          tokens={recentSales.data ?? []}
          isLoading={recentSales.isPending}
          emptyMessage="No sales yet."
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-3" aria-labelledby="collections-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="collections" className="realm-kicker scroll-mt-52 text-lg">
              Collections
            </h2>
            <CurrencySwitcher label="Prices in" hideHelp />
          </div>
          <span id="collections-heading" className="sr-only">
            Collections
          </span>
          <CollectionsTable collections={filteredCollections} currency={currency} isLoading={isLoading} />
        </section>

        {promotedCollection && !isLoading ? (
          <aside className="hidden lg:block" aria-label="Spotlight">
            <h2 className="realm-kicker mb-3 text-lg">Spotlight</h2>
            <PromotedCollection {...promotedCollection} />
          </aside>
        ) : null}
      </div>
    </main>
  );
}
