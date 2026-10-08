import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseWalletPortfolioQuery,
  mockUseCollectionQuery,
  mockUseCollectionTokensQuery,
  mockGetMarketplaceRuntimeConfig,
} = vi.hoisted(() => ({
  mockUseWalletPortfolioQuery: vi.fn(),
  mockUseCollectionQuery: vi.fn(),
  mockUseCollectionTokensQuery: vi.fn(),
  mockGetMarketplaceRuntimeConfig: vi.fn(),
}));

vi.mock("@/lib/marketplace/hooks", () => ({
  useWalletPortfolioQuery: mockUseWalletPortfolioQuery,
  useCollectionQuery: mockUseCollectionQuery,
  useCollectionTokensQuery: mockUseCollectionTokensQuery,
}));

vi.mock("@/lib/marketplace/config", () => ({
  getMarketplaceRuntimeConfig: mockGetMarketplaceRuntimeConfig,
}));

import { WalletProfileView } from "@/features/profile/wallet-profile-view";

const EMPTY_COLLECTION_QUERY = {
  data: null,
  status: "success",
  error: null,
  isLoading: false,
  isError: false,
};

const EMPTY_TOKENS_QUERY = {
  data: { page: { tokens: [] } },
  status: "success",
  error: null,
  isLoading: false,
  isError: false,
};

describe("WalletProfileView", () => {
  beforeEach(() => {
    mockUseWalletPortfolioQuery.mockReset();
    mockUseCollectionQuery.mockReset();
    mockUseCollectionTokensQuery.mockReset();
    mockGetMarketplaceRuntimeConfig.mockReset();

    mockUseWalletPortfolioQuery.mockReturnValue({
      data: { page: { balances: [] } },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });
    mockUseCollectionQuery.mockReturnValue(EMPTY_COLLECTION_QUERY);
    mockUseCollectionTokensQuery.mockReturnValue(EMPTY_TOKENS_QUERY);
    mockGetMarketplaceRuntimeConfig.mockReturnValue({
      collections: [
        { address: "0xcol1", name: "Collected One" },
        { address: "0xcollection-a", name: "Golden Token" },
        { address: "0xcollection-b", name: "Realms" },
      ],
    });
  });

  it("shows_loading_state", () => {
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: undefined,
      status: "loading",
      error: null,
      isFetching: true,
      refresh: vi.fn(),
    });

    render(<WalletProfileView address="0xabc123" />);

    expect(screen.getByTestId("profile-loading")).toBeInTheDocument();
  });

  it("shows_empty_state_when_wallet_has_no_items", () => {
    render(<WalletProfileView address="0xabc123" />);

    expect(screen.getByText(/no items found for this wallet/i)).toBeVisible();
  });

  it("shows_owned_items_with_links_and_filters_zero_balances", () => {
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: {
        page: {
          balances: [
            {
              contract_address: "0xcol1",
              token_id: "7",
              balance: "2",
            },
            {
              contract_address: "0xcol2",
              token_id: "9",
              balance: "0",
            },
          ],
        },
      },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    mockUseCollectionTokensQuery.mockReturnValue({
      ...EMPTY_TOKENS_QUERY,
      data: {
        page: {
          tokens: [{ token_id: "7", metadata: {} }],
        },
      },
    });

    render(<WalletProfileView address="0xabc123" />);

    // Collection section header for the owned collection is visible
    expect(screen.getByText("Collected One")).toBeVisible();

    // Token link leads to the correct page
    const itemLink = screen.getByRole("link", { name: /view token 7/i });
    expect(itemLink).toHaveAttribute("href", "/collections/0xcol1/7");

    // Filter input is present
    expect(
      screen.getByRole("textbox", { name: /filter collection or token/i }),
    ).toBeVisible();

    // Zero-balance item is not shown
    expect(screen.queryByText("0xcol2")).toBeNull();
  });

  it("filters_items_by_collection_or_token", async () => {
    const user = userEvent.setup();
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: {
        page: {
          balances: [
            {
              contract_address: "0xcollection-a",
              token_id: "7",
              balance: "1",
            },
            {
              contract_address: "0xcollection-b",
              token_id: "99",
              balance: "1",
            },
          ],
        },
      },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    render(<WalletProfileView address="0xabc123" />);

    await user.type(
      screen.getByRole("textbox", { name: /filter collection or token/i }),
      "99",
    );

    expect(screen.queryByText("Golden Token")).toBeNull();
    expect(screen.getByText("Realms")).toBeVisible();
  });

  it("filters_items_by_selected_collection", async () => {
    const user = userEvent.setup();
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: {
        page: {
          balances: [
            {
              contract_address: "0xcollection-a",
              token_id: "7",
              balance: "1",
            },
            {
              contract_address: "0xcollection-b",
              token_id: "99",
              balance: "1",
            },
          ],
        },
      },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    render(<WalletProfileView address="0xabc123" />);

    await user.click(
      screen.getByRole("combobox", { name: /filter by collection/i }),
    );
    await user.click(screen.getByRole("option", { name: "Golden Token" }));

    expect(screen.getAllByText("Golden Token")).toHaveLength(2);
    expect(screen.queryByText("Realms")).toBeNull();
  });

  it("shows_configured_and_unconfigured_collection_names_in_the_filter_and_results", async () => {
    const user = userEvent.setup();
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: {
        page: {
          balances: [
            {
              contract_address: "0xcollection-a",
              token_id: "7",
              balance: "1",
            },
            {
              contract_address: "0xoutside-market",
              token_id: "99",
              balance: "1",
            },
          ],
        },
      },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    render(<WalletProfileView address="0xabc123" />);

    expect(screen.getByText("Golden Token")).toBeVisible();
    expect(screen.getByText("0xoutside-market")).toBeVisible();

    await user.click(
      screen.getByRole("combobox", { name: /filter by collection/i }),
    );

    expect(screen.getByRole("option", { name: "Golden Token" })).toBeVisible();
    expect(screen.getByRole("option", { name: "0xoutside-market" })).toBeVisible();
  });

  it("matches_configured_collections_when_balance_addresses_use_different_hex_padding", () => {
    mockGetMarketplaceRuntimeConfig.mockReturnValue({
      collections: [{ address: "0x0abc", name: "Padded Collection" }],
    });
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: {
        page: {
          balances: [
            {
              contract_address: "0xabc",
              token_id: "7",
              balance: "1",
            },
          ],
        },
      },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    render(<WalletProfileView address="0xabc123" />);

    expect(screen.getByText("Padded Collection")).toBeVisible();
  });

  it("passes_project_id_to_collection_queries_for_configured_holdings", () => {
    mockGetMarketplaceRuntimeConfig.mockReturnValue({
      collections: [
        { address: "0xcollection-a", name: "Golden Token", projectId: "project-a" },
      ],
    });
    mockUseWalletPortfolioQuery.mockReturnValue({
      data: {
        page: {
          balances: [
            {
              contract_address: "0xcollection-a",
              token_id: "7",
              balance: "1",
            },
          ],
        },
      },
      status: "ready",
      error: null,
      isFetching: false,
      refresh: vi.fn(),
    });

    render(<WalletProfileView address="0xabc123" />);

    expect(mockUseCollectionQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xcollection-a",
        projectId: "project-a",
      }),
    );
    expect(mockUseCollectionTokensQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xcollection-a",
        project: "project-a",
      }),
      { enabled: true },
    );
  });
});

vi.mock("@starknet-react/core",()=>({useAccount:()=>({address:undefined})}));
