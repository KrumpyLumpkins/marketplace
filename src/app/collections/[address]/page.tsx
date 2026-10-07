import { Suspense } from "react";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { CollectionRouteContainer } from "@/features/collections/collection-route-container";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { prefetchTraitNamesSummary } from "@/lib/marketplace/trait-summary-prefetch";
import { makeQueryClient } from "@/lib/marketplace/query-client";
import { buildMarketplacePageMetadata } from "@/lib/seo/metadata";

type CollectionPageProps = {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export default async function CollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const { address } = await params;
  const { cursor } = await searchParams;
  const queryClient = makeQueryClient();
  const selectedCollection = getMarketplaceRuntimeConfig().collections.find(
    (collection) => collection.address === address,
  );

  await prefetchTraitNamesSummary(queryClient, {
    address,
    projectId: selectedCollection?.projectId,
  });

  return (
    <main className="flex min-h-screen w-full items-start px-4 pb-6 sm:px-6">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense>
          <CollectionRouteContainer address={address} cursor={cursor ?? null} />
        </Suspense>
      </HydrationBoundary>
    </main>
  );
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { address } = await params;
  const { getCollectionSeoData } = await import("@/lib/marketplace/seo-data");
  const seoData = await getCollectionSeoData(address);

  return buildMarketplacePageMetadata({
    title: seoData.exists
      ? `${seoData.name} | Realms.market`
      : `Collection ${seoData.name} | Realms.market`,
    description:
      seoData.description ??
      (seoData.exists
        ? `Explore listings and activity for ${seoData.name}.`
        : `Collection ${seoData.name} is unavailable on Realms.market.`),
    pathname: `/collections/${address}`,
    image: seoData.image ?? `/collections/${address}/opengraph-image`,
    noIndex: !seoData.exists,
  });
}
