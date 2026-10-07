"use client";

import { useState, type ReactNode } from "react";
import { MarketplaceProvider as SdkProvider } from "@biblio/marketplace-react";
import { getAppMarketplaceClient } from "@/lib/marketplace/app-client";
import { MarketplaceClientProvider } from "@/lib/marketplace/react";
import { StarknetConfig } from "@starknet-react/core";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { buildStarknetConfig } from "@/lib/marketplace/starknet-config";

type MarketplaceProviderProps = {
  children: ReactNode;
};

export function MarketplaceProvider({ children }: MarketplaceProviderProps) {
  const { chainLabel, sdkConfig } = getMarketplaceRuntimeConfig();
  const [starknetConfig] = useState(() => buildStarknetConfig(chainLabel));
  const [client] = useState(getAppMarketplaceClient);

  return (
    <StarknetConfig {...starknetConfig}>
      <SdkProvider client={client}>
        <MarketplaceClientProvider config={sdkConfig}>
          {children}
        </MarketplaceClientProvider>
      </SdkProvider>
    </StarknetConfig>
  );
}
