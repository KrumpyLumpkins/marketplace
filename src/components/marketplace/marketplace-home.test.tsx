import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceHome } from "@/components/marketplace/marketplace-home";

const { mockUseHomePageData } = vi.hoisted(() => ({
  mockUseHomePageData: vi.fn(),
}));
const { mockSearchParams } = vi.hoisted(() => ({
  mockSearchParams: vi.fn(),
}));

vi.mock("@/features/home/use-home-page-data", () => ({
  useHomePageData: mockUseHomePageData,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
}));

vi.mock("@/features/home/hero-banner", () => ({
  HeroBanner: () => <section data-testid="hero-banner">Hero</section>,
}));

vi.mock("@/features/home/collection-list-item", () => ({
  CollectionListItem: ({ name }: { name: string }) => (
    <div data-testid="collection-list-item">{name}</div>
  ),
}));

vi.mock("@/features/home/promoted-collection", () => ({
  PromotedCollection: ({ name }: { name: string }) => (
    <div data-testid="promoted-collection">{name}</div>
  ),
}));

vi.mock("@/lib/animation", () => ({
  useEntrance: () => ({ current: null }),
}));

describe("MarketplaceHome", () => {
  beforeEach(() => {
    mockUseHomePageData.mockReset();
    mockSearchParams.mockReset();
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockUseHomePageData.mockReturnValue({
      featuredCollection: {
        address: "0xabc",
        name: "Genesis",
      },
      trendingTokens: [],
      collectionCards: [
        { address: "0xabc", name: "Genesis" },
        { address: "0xdef", name: "Alpha" },
      ],
      isLoading: false,
    });
  });

  it("renders_hero_banner", () => {
    render(<MarketplaceHome />);

    expect(screen.getByTestId("hero-banner")).toBeVisible();
  });

  it("renders_collection_list_items", () => {
    render(<MarketplaceHome />);

    const items = screen.getAllByTestId("collection-list-item");
    expect(items.length).toBe(2);
  });

  it("renders_promoted_collection", () => {
    render(<MarketplaceHome />);

    expect(screen.getByTestId("promoted-collection")).toBeVisible();
  });

  it("renders_empty_state_when_no_collections", () => {
    mockUseHomePageData.mockReturnValue({
      featuredCollection: null,
      trendingTokens: [],
      collectionCards: [],
      isLoading: false,
    });

    render(<MarketplaceHome />);

    expect(screen.getByText(/no collections configured/i)).toBeVisible();
  });
});
