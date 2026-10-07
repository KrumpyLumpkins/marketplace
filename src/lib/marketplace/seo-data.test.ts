import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateMarketplaceClient,
  mockGetCollection,
  mockGetToken,
  mockRuntimeConfig,
} = vi.hoisted(() => ({
  mockCreateMarketplaceClient: vi.fn(),
  mockGetCollection: vi.fn(),
  mockGetToken: vi.fn(),
  mockRuntimeConfig: {
    chainLabel: "SN_SEPOLIA",
    warnings: [],
    sdkConfig: {
      chainId: "0x534e5f5345504f4c4941",
    },
    collections: [
      { address: "0xabc", name: "Genesis", projectId: "project-a" },
    ],
  },
}));

vi.mock("@/lib/marketplace/api-client", () => ({
  createMarketplaceClient: mockCreateMarketplaceClient,
}));

vi.mock("@/lib/marketplace/config", () => ({
  getMarketplaceRuntimeConfig: () => mockRuntimeConfig,
}));

describe("marketplace seo data", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetCollection.mockReset();
    mockGetToken.mockReset();
    mockCreateMarketplaceClient.mockReset();
    mockCreateMarketplaceClient.mockReturnValue({
      getCollection: mockGetCollection,
      getToken: mockGetToken,
    });
  });

  it("returns_collection_name_description_and_image", async () => {
    mockGetCollection.mockResolvedValue({
      address: "0xabc",
      metadata: {
        name: "Genesis",
        description: "A flagship collection",
        image: "https://cdn.example.com/genesis.png",
      },
    });

    const { getCollectionSeoData } = await import("@/lib/marketplace/seo-data");
    const result = await getCollectionSeoData("0xabc");

    expect(result).toEqual({
      exists: true,
      name: "Genesis",
      description: "A flagship collection",
      image: "https://cdn.example.com/genesis.png",
    });
    expect(mockGetCollection).toHaveBeenCalledWith({
      address: "0xabc",
      projectId: "project-a",
      fetchImages: true,
    });
  });

  it("retries_token_lookup_with_alternate_id_format", async () => {
    mockGetCollection.mockResolvedValue({
      address: "0xabc",
      metadata: {
        name: "Genesis",
        image: "https://cdn.example.com/genesis.png",
      },
    });
    mockGetToken
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        token: {
          token_id: "0x935",
          metadata: {
            name: "Loot Chest #2357",
            image: "https://cdn.example.com/2357.png",
          },
          image: null,
        },
      });

    const { getTokenSeoData } = await import("@/lib/marketplace/seo-data");
    const result = await getTokenSeoData("0xabc", "2357");

    expect(result).toEqual({
      exists: true,
      tokenName: "Loot Chest #2357",
      collectionName: "Genesis",
      description: "View listings and activity for Loot Chest #2357.",
      image: "https://cdn.example.com/2357.png",
      collectionImage: "https://cdn.example.com/genesis.png",
    });
    expect(mockGetToken).toHaveBeenNthCalledWith(1, {
      collection: "0xabc",
      tokenId: "2357",
      projectId: "project-a",
      fetchImages: true,
    });
    expect(mockGetToken).toHaveBeenNthCalledWith(2, {
      collection: "0xabc",
      tokenId: "0x935",
      projectId: "project-a",
      fetchImages: true,
    });
  });

  it("returns_noindex_fallback_payload_when_token_not_found", async () => {
    mockGetCollection.mockResolvedValue({
      address: "0xabc",
      metadata: {
        name: "Genesis",
      },
    });
    mockGetToken.mockResolvedValue(null);

    const { getTokenSeoData } = await import("@/lib/marketplace/seo-data");
    const result = await getTokenSeoData("0xabc", "999");

    expect(result).toEqual({
      exists: false,
      tokenName: "Token #999",
      collectionName: "Genesis",
      description: null,
      image: null,
      collectionImage: null,
    });
  });

  it("returns_collection_fallback_when_client_init_fails", async () => {
    mockCreateMarketplaceClient.mockImplementation(() => {
      throw new Error("init failed");
    });

    const { getCollectionSeoData } = await import("@/lib/marketplace/seo-data");
    const result = await getCollectionSeoData("0xabc");

    expect(result).toEqual({
      exists: false,
      name: "Genesis",
      description: null,
      image: null,
    });
    expect(mockGetCollection).not.toHaveBeenCalled();
  });

  it("fetches_collection_and_token_in_parallel", async () => {
    const callLog: string[] = [];
    const delay = 50;

    mockGetCollection.mockImplementation(async () => {
      callLog.push("collection:start");
      await new Promise((r) => setTimeout(r, delay));
      callLog.push("collection:end");
      return {
        address: "0xabc",
        metadata: { name: "Genesis", image: "https://cdn.example.com/genesis.png" },
      };
    });

    mockGetToken.mockImplementation(async () => {
      callLog.push("token:start");
      await new Promise((r) => setTimeout(r, delay));
      callLog.push("token:end");
      return {
        token: {
          token_id: "1",
          metadata: { name: "Token #1", image: "https://cdn.example.com/1.png" },
          image: null,
        },
      };
    });

    const { getTokenSeoData } = await import("@/lib/marketplace/seo-data");
    const start = Date.now();
    await getTokenSeoData("0xabc", "1");
    const elapsed = Date.now() - start;

    // If parallel: both start before either ends
    expect(callLog[0]).toBe("collection:start");
    expect(callLog[1]).toBe("token:start");

    // Elapsed should be ~50ms (parallel), not ~100ms (sequential)
    expect(elapsed).toBeLessThan(delay * 2 - 10);
  });

  it("returns_token_fallback_when_client_init_fails", async () => {
    mockCreateMarketplaceClient.mockImplementation(() => {
      throw new Error("init failed");
    });

    const { getTokenSeoData } = await import("@/lib/marketplace/seo-data");
    const result = await getTokenSeoData("0xabc", "7");

    expect(result).toEqual({
      exists: false,
      tokenName: "Token #7",
      collectionName: "Genesis",
      description: null,
      image: null,
      collectionImage: null,
    });
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});
