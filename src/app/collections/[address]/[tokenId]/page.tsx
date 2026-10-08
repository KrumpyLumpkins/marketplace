import { TokenDetailSkeleton } from "@/components/marketplace/loading-state";
import { Suspense } from "react";
import type { Metadata } from "next";
import { TokenDetailView } from "@/features/token/token-detail-view";
import { buildMarketplacePageMetadata } from "@/lib/seo/metadata";

type TokenPageProps = {
  params: Promise<{ address: string; tokenId: string }>;
};

export default async function TokenPage({ params }: TokenPageProps) {
  const { address, tokenId } = await params;

  return (
    <main className="market-page w-full">
      <Suspense fallback={<TokenDetailSkeleton />}>
        <TokenDetailView address={address} tokenId={tokenId} />
      </Suspense>
    </main>
  );
}

export async function generateMetadata({
  params,
}: TokenPageProps): Promise<Metadata> {
  const { address, tokenId } = await params;
  const { getTokenSeoData } = await import("@/lib/marketplace/seo-data");
  const seoData = await getTokenSeoData(address, tokenId);

  return buildMarketplacePageMetadata({
    title: `${seoData.tokenName} | ${seoData.collectionName} | Realms.market`,
    description:
      seoData.description ??
      `View listings and activity for ${seoData.tokenName}.`,
    pathname: `/collections/${address}/${tokenId}`,
    image:
      seoData.image ??
      seoData.collectionImage ??
      `/collections/${address}/${tokenId}/opengraph-image`,
    noIndex: !seoData.exists,
  });
}
