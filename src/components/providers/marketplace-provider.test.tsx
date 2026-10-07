import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceProvider } from "@/components/providers/marketplace-provider";

const {
  mockGetMarketplaceRuntimeConfig,
  mockMakeQueryClient,
  mockBuildStarknetConfig,
  mockStarknetConfigProps,
  mockQueryClientProviderClient,
  mockMarketplaceClientProviderConfig,
} = vi.hoisted(() => ({
  mockGetMarketplaceRuntimeConfig: vi.fn(),
  mockMakeQueryClient: vi.fn(),
  mockBuildStarknetConfig: vi.fn(),
  mockStarknetConfigProps: vi.fn(),
  mockQueryClientProviderClient: vi.fn(),
  mockMarketplaceClientProviderConfig: vi.fn(),
}));

vi.mock("@/lib/marketplace/config", () => ({
  getMarketplaceRuntimeConfig: mockGetMarketplaceRuntimeConfig,
}));

vi.mock("@/lib/marketplace/query-client", () => ({
  makeQueryClient: mockMakeQueryClient,
}));

vi.mock("@/lib/marketplace/starknet-config", () => ({
  buildStarknetConfig: mockBuildStarknetConfig,
}));

vi.mock("@starknet-react/core", () => ({
  StarknetConfig: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    mockStarknetConfigProps(props);
    return <>{children}</>;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({
    client,
    children,
  }: {
    client: unknown;
    children: React.ReactNode;
  }) => {
    mockQueryClientProviderClient(client);
    return <>{children}</>;
  },
}));

vi.mock("@/lib/marketplace/react", () => ({
  MarketplaceClientProvider: ({
    config,
    children,
  }: {
    config: unknown;
    children: React.ReactNode;
  }) => {
    mockMarketplaceClientProviderConfig(config);
    return <>{children}</>;
  },
}));

describe("marketplace provider", () => {
  beforeEach(() => {
    mockGetMarketplaceRuntimeConfig.mockReset();
    mockMakeQueryClient.mockReset();
    mockBuildStarknetConfig.mockReset();
    mockStarknetConfigProps.mockReset();
    mockQueryClientProviderClient.mockReset();
    mockMarketplaceClientProviderConfig.mockReset();
  });

  it("wraps app with starknet, query, and marketplace providers", () => {
    const mockQueryClient = { query: "client" };
    const sdkConfig = { chainId: "0x534e5f4d41494e", runtime: "edge" };
    const starknetConfig = {
      chains: [{ id: "mainnet" }, { id: "sepolia" }],
      provider: vi.fn(),
      connectors: [{ id: "ready" }],
      defaultChainId: "mainnet",
    };

    mockGetMarketplaceRuntimeConfig.mockReturnValue({
      chainLabel: "SN_MAIN",
      sdkConfig,
      featureFlags: { enableDeferredMetadataHydration: false },
      warnings: [],
      collections: [],
    });
    mockMakeQueryClient.mockReturnValue(mockQueryClient);
    mockBuildStarknetConfig.mockReturnValue(starknetConfig);

    render(
      <MarketplaceProvider>
        <div>child content</div>
      </MarketplaceProvider>,
    );

    expect(screen.getByText("child content")).toBeVisible();
    expect(mockBuildStarknetConfig).toHaveBeenCalledWith("SN_MAIN");
    expect(mockStarknetConfigProps).toHaveBeenCalledWith(starknetConfig);
    expect(mockQueryClientProviderClient).toHaveBeenCalledWith(mockQueryClient);
    expect(mockMarketplaceClientProviderConfig).toHaveBeenCalledWith(sdkConfig);
  });
});

vi.mock("@/lib/marketplace/app-client",()=>({getAppMarketplaceClient:()=>({queryClient:{query:"client"}})}));
