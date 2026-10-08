"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MarketplaceProvider as SdkProvider } from "@biblio/marketplace-react";
import { getAppMarketplaceClient } from "@/lib/marketplace/app-client";
import { MarketplaceClientProvider } from "@/lib/marketplace/react";
import { StarknetConfig } from "@starknet-react/core";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { buildStarknetConfig } from "@/lib/marketplace/starknet-config";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";
import { TooltipProvider } from "@/components/ui/tooltip";

type MarketplaceProviderProps = {
  children: ReactNode;
};

export function MarketplaceProvider({ children }: MarketplaceProviderProps) {
  const { chainLabel, sdkConfig } = getMarketplaceRuntimeConfig();
  const [starknetConfig] = useState(() => buildStarknetConfig(chainLabel));
  const [client] = useState(getAppMarketplaceClient);

  // The remembered market currency is applied after hydration so server and client markup match.
  useEffect(() => {
    void useMarketCurrency.persist.rehydrate();
  }, []);

  return (
    <StarknetConfig {...starknetConfig}>
      <SdkProvider client={client}>
        <MarketplaceClientProvider config={sdkConfig}>
          <TooltipProvider>{children}</TooltipProvider>
        </MarketplaceClientProvider>
      </SdkProvider>
    </StarknetConfig>
  );
}
