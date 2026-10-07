import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionCard } from "@/features/home/collection-card";

const { mockUseCollectionTokensQuery } = vi.hoisted(() => ({
  mockUseCollectionTokensQuery: vi.fn(),
}));

let intersectionObserverCallback: IntersectionObserverCallback | null = null;

vi.mock("@/lib/marketplace/hooks", () => ({
  useCollectionTokensQuery: (...args: unknown[]) => mockUseCollectionTokensQuery(...args),
}));

function successQuery<T>(data: T) {
  return {
    data,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
}

describe("CollectionCard", () => {
  beforeEach(() => {
    mockUseCollectionTokensQuery.mockReset();
    mockUseCollectionTokensQuery.mockReturnValue(successQuery({ page: { tokens: [] } }));
    intersectionObserverCallback = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback) {
          intersectionObserverCallback = callback;
        }

        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = "0px";
        thresholds = [];
      },
    );
  });

  it("renders_collection_name", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
      />,
    );

    expect(screen.getByText("Genesis")).toBeVisible();
  });

  it("renders_collection_image", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
        imageUrl="https://cdn.example/genesis.png"
      />,
    );

    expect(screen.getByAltText("Genesis preview")).toHaveAttribute(
      "src",
      "https://cdn.example/genesis.png",
    );
  });

  it("renders_floor_price", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
        floorPrice="1.8"
      />,
    );

    expect(screen.getByText("1.8")).toBeVisible();
  });

  it("renders_item_count", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
        totalSupply="88"
      />,
    );

    expect(screen.getByText(/items 88/i)).toBeVisible();
  });

  it("links_to_collection_page", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
      />,
    );

    expect(screen.getByRole("link", { name: /open genesis/i })).toHaveAttribute(
      "href",
      "/collections/0xabc",
    );
  });

  it("renders_placeholder_when_no_image", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
      />,
    );

    expect(screen.getByTestId("collection-card-image-fallback")).toBeVisible();
  });

  it("renders_first_token_image_when_collection_image_is_missing", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successQuery({
        page: {
          tokens: [
            {
              token_id: "1",
              image: "https://cdn.example/first-token.png",
              metadata: { name: "Token #1" },
            },
          ],
        },
      }),
    );

    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
      />,
    );

    expect(screen.getByAltText("Genesis preview")).toHaveAttribute(
      "src",
      "https://cdn.example/first-token.png",
    );
  });

  it("prefers_explicit_collection_image_over_token_preview", () => {
    mockUseCollectionTokensQuery.mockReturnValue(
      successQuery({
        page: {
          tokens: [
            {
              token_id: "1",
              image: "https://cdn.example/first-token.png",
              metadata: { name: "Token #1" },
            },
          ],
        },
      }),
    );

    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
        imageUrl="https://cdn.example/collection.png"
      />,
    );

    expect(screen.getByAltText("Genesis preview")).toHaveAttribute(
      "src",
      "https://cdn.example/collection.png",
    );
  });

  it("defers_preview_token_fetch_until_the_card_is_visible", () => {
    render(
      <CollectionCard
        address="0xabc"
        name="Genesis"
      />,
    );

    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xabc",
        limit: 12,
        fetchImages: true,
      }),
      expect.objectContaining({
        enabled: false,
        staleTime: 300000,
      }),
    );

    act(() => {
      intersectionObserverCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(mockUseCollectionTokensQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        address: "0xabc",
        limit: 12,
        fetchImages: true,
      }),
      expect.objectContaining({
        enabled: true,
        staleTime: 300000,
      }),
    );
  });
});
