import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

const { mockUseWalletPortfolioQuery } = vi.hoisted(() => ({
  mockUseWalletPortfolioQuery: vi.fn(),
}));

vi.mock("@/lib/marketplace/hooks", () => ({
  useWalletPortfolioQuery: mockUseWalletPortfolioQuery,
}));

describe("profile route page", () => {
  it("renders profile content for an address route", async () => {
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: { page: { balances: [] } },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    const pageModule = await import("./[address]/page");
    const ProfilePage = pageModule.default;

    const page = await ProfilePage({
      params: Promise.resolve({ address: "0xabc123" }),
    });

    render(page);

    expect(
      screen.getByRole("heading", { name: /wallet profile/i }),
    ).toBeVisible();
    // Address is truncated in the UI (e.g. "0xabc1...c123")
    expect(screen.getByText(/0xabc1/)).toBeVisible();
  });
});

vi.mock("@starknet-react/core",()=>({useAccount:()=>({address:undefined})}));
