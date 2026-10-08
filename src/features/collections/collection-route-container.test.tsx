vi.mock("./use-sweep-candidates",()=>({useSweepCandidates:()=>({data:[]})}));
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionRouteContainer } from "@/features/collections/collection-route-container";
import type { SeedCollection } from "@/lib/marketplace/config";

const { mockUseCollectionQuery } = vi.hoisted(() => ({
  mockUseCollectionQuery: vi.fn(),
}));

vi.mock("@/lib/marketplace/hooks", () => ({
  useCollectionQuery: mockUseCollectionQuery,
  useTraitNamesSummaryQuery: () => ({ data: [], isLoading: false }),
  useTraitValuesQuery: () => ({ data: null, isLoading: false }),
  useCollectionListingsQuery: () => ({ data: [], isLoading: false, isSuccess: true }),
  useCollectionTokensQuery: () => ({ data: null, isLoading: false, isSuccess: false }),
}));

vi.mock("@/features/collections/collection-token-grid", () => ({
  CollectionTokenGrid: (props: Record<string, unknown>) => (
    <div data-testid="collection-token-grid">Token Grid: {props.address as string}</div>
  ),
}));

vi.mock("@/features/collections/collection-activity-feed", () => ({
  CollectionActivityFeed: () => <div data-testid="collection-activity-feed" />,
}));
vi.mock("@/features/collections/collection-offers-panel", () => ({
  CollectionOffersPanel: () => <div data-testid="collection-offers-panel" />,
}));
vi.mock("@/features/collections/analytics/collection-analytics", () => ({
  CollectionAnalytics: () => <div data-testid="collection-analytics" />,
}));
vi.mock("@/features/collections/collection-stats-strip", () => ({
  CollectionStatsStrip: () => <dl data-testid="collection-stats-strip" />,
}));
vi.mock("@/features/trading/currency-switcher", () => ({
  CurrencySwitcher: () => <div data-testid="currency-switcher" />,
}));

vi.mock("@/features/collections/trait-filter-sidebar", () => ({
  TraitFilterSidebar: () => (
    <div data-testid="trait-filter-sidebar">Trait Sidebar</div>
  ),
}));

vi.mock("@/features/cart/store/cart-store", () => ({
  CART_MAX_ITEMS: 25,
  useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ items: [], addCandidates: vi.fn(), setOpen: vi.fn() }),
}));

vi.mock("@/features/collections/sweep-bar", () => ({
  SweepBar: () => <div data-testid="sweep-bar" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => "/collections/0xabc",
  useSearchParams: () => new URLSearchParams(),
}));

const collections: SeedCollection[] = [
  { address: "0xabc", name: "Genesis", projectId: "project-a" },
  { address: "0xdef", name: "Artifacts", projectId: "project-b" },
];

describe("collection route container", () => {
  beforeEach(() => {
    mockUseCollectionQuery.mockReset();
  });

  it("renders_collection_header_with_name", () => {
    mockUseCollectionQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isSuccess: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(
      <CollectionRouteContainer
        address="0xabc"
        collections={collections}
        cursor={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Genesis" })).toBeVisible();
  });
});

