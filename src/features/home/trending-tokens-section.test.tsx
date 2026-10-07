import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NormalizedToken } from "@/lib/marketplace/types";
import { TrendingTokensSection } from "@/features/home/trending-tokens-section";

const { mockMarketplaceTokenCard } = vi.hoisted(() => ({
  mockMarketplaceTokenCard: vi.fn(),
}));

vi.mock("@/components/marketplace/token-card", () => ({
  MarketplaceTokenCard: (props: Record<string, unknown>) => {
    mockMarketplaceTokenCard(props);
    return <div data-testid="trending-token-card">{String(props.href)}</div>;
  },
}));

function token(tokenId: string): NormalizedToken {
  return {
    token_id: tokenId,
    metadata: { name: `Token #${tokenId}` },
  } as NormalizedToken;
}

describe("TrendingTokensSection", () => {
  beforeEach(() => {
    mockMarketplaceTokenCard.mockReset();
  });

  it("renders_section_heading", () => {
    render(
      <TrendingTokensSection
        tokens={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: /trending tokens/i })).toBeVisible();
  });

  it("renders_token_card_per_token", () => {
    render(
      <TrendingTokensSection
        tokens={[
          { token: token("1"), href: "/collections/0xabc/1" },
          { token: token("2"), href: "/collections/0xabc/2" },
        ]}
      />,
    );

    expect(screen.getAllByTestId("trending-token-card")).toHaveLength(2);
  });

  it("passes_correct_href", () => {
    render(
      <TrendingTokensSection
        tokens={[
          { token: token("1"), href: "/collections/0xabc/1" },
        ]}
      />,
    );

    expect(mockMarketplaceTokenCard).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/collections/0xabc/1" }),
    );
  });

  it("passes_price_to_card", () => {
    render(
      <TrendingTokensSection
        tokens={[
          {
            token: token("1"),
            href: "/collections/0xabc/1",
            price: "100",
            currency: "0xfee",
          },
        ]}
      />,
    );

    expect(mockMarketplaceTokenCard).toHaveBeenCalledWith(
      expect.objectContaining({ price: "100", currency: "0xfee" }),
    );
  });

  it("renders_skeletons_when_loading", () => {
    render(
      <TrendingTokensSection
        tokens={[]}
        isLoading
      />,
    );

    expect(screen.getAllByTestId("trending-token-skeleton")).toHaveLength(6);
  });

  it("renders_empty_state", () => {
    render(
      <TrendingTokensSection
        tokens={[]}
      />,
    );

    expect(screen.getByText(/no trending tokens/i)).toBeVisible();
  });

  it("container_scrolls_horizontally", () => {
    render(
      <TrendingTokensSection
        tokens={[
          { token: token("1"), href: "/collections/0xabc/1" },
        ]}
      />,
    );

    expect(screen.getByTestId("trending-tokens-scroll")).toHaveClass("overflow-x-auto");
  });
});
