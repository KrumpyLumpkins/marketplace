import { HomeSkeleton } from "@/components/marketplace/loading-state";
import { Suspense } from "react";
import { MarketplaceHome } from "@/components/marketplace/marketplace-home";

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <MarketplaceHome />
    </Suspense>
  );
}
