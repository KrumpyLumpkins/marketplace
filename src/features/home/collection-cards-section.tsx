"use client";

import { CollectionCard } from "@/features/home/collection-card";
import type { CollectionCardData } from "@/features/home/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntrance } from "@/lib/animation";

type CollectionCardsSectionProps = {
  collections: CollectionCardData[];
  isLoading?: boolean;
};

export function CollectionCardsSection({
  collections,
  isLoading = false,
}: CollectionCardsSectionProps) {
  const gridRef = useEntrance<HTMLDivElement>({
    selector: "[data-card]",
    staggerDelay: 40,
    translateY: 16,
  });

  return (
    <section data-testid="collection-cards" className="space-y-3">
      <h2 className="realm-kicker text-lg">
        Collections
      </h2>

      {isLoading ? (
        <div role="status" aria-label="Loading collections"
          data-testid="collection-cards-grid"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={index < 2 ? "overflow-hidden rounded-lg border border-border/50 sm:col-span-2 md:col-span-1 lg:col-span-2" : "overflow-hidden rounded-lg border border-border/50"}>
              <Skeleton data-testid="collection-card-skeleton" className={index < 2 ? "aspect-[16/9] w-full rounded-none" : "aspect-square w-full rounded-none"} />
              <div className="space-y-2 p-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections to show</p>
      ) : (
        <div
          ref={gridRef}
          data-testid="collection-cards-grid"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
        >
          {collections.map((collection, index) => (
            <div
              key={collection.address}
              data-card
              className={index < 2 ? "sm:col-span-2 md:col-span-1 lg:col-span-2" : ""}
            >
              <CollectionCard {...collection} featured={index < 2} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
