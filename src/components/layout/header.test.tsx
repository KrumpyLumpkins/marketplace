import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./header";

const {
  mockUseAccount,
  mockUseConnect,
  mockUseDisconnect,
  mockConnect,
  mockDisconnect,
  mockUseBalance,
} = vi.hoisted(() => ({
  mockUseAccount: vi.fn(),
  mockUseConnect: vi.fn(),
  mockUseDisconnect: vi.fn(),
  mockConnect: vi.fn(),
  mockDisconnect: vi.fn(),
  mockUseBalance: vi.fn(),
}));
const { mockPush, mockSearchParams } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearchParams: vi.fn(),
}));

vi.mock("@starknet-react/core", () => ({
  useAccount: mockUseAccount,
  useConnect: mockUseConnect,
  useDisconnect: mockUseDisconnect,
  useBalance: mockUseBalance,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/trader",
  useSearchParams: () => mockSearchParams(),
}));

vi.mock("@/lib/marketplace/use-trade", () => ({
  useTrade: () => ({
    config: { demo: false, status: { safeForCheckout: true } },
  }),
}));

vi.mock("@/features/cart/components/cart-sidebar", () => ({
  CartSidebar: () => <button type="button">Cart (0)</button>,
}));

describe("Header", () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockDisconnect.mockReset();
    mockPush.mockReset();
    mockSearchParams.mockReset();
    mockUseBalance.mockReturnValue({ data: undefined, isLoading: false });
    mockSearchParams.mockReturnValue(new URLSearchParams());

    mockUseAccount.mockReturnValue({
      status: "disconnected",
      isConnected: false,
      isDisconnected: true,
      address: undefined,
    });
    mockUseConnect.mockReturnValue({
      connect: vi.fn(),
      connectAsync: mockConnect,
      connectors: [{ id: "controller", name: "Controller" }],
      pendingConnector: undefined,
      isPending: false,
    });
    mockUseDisconnect.mockReturnValue({
      disconnect: mockDisconnect,
      isPending: false,
    });
  });

  it("prioritises marketplace destinations and highlights the current route", () => {
    render(<Header />);
    expect(
      screen.getByRole("link", { name: "Realms Market home" }),
    ).toHaveAttribute("href", "/");
    const nav = within(
      screen.getByRole("navigation", { name: "Marketplace" }),
    );
    expect(nav.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(nav.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
      "href",
      "/portfolio",
    );
    expect(nav.getByRole("link", { name: "Trading" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "Explore" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the Realms.World ecosystem bar above the marketplace tools", () => {
    render(<Header />);
    const ecosystem = within(
      screen.getByRole("navigation", { name: "Realms ecosystem" }),
    );
    expect(ecosystem.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "https://realms.world/",
    );
    expect(ecosystem.getByRole("link", { name: "Games" })).toHaveAttribute(
      "href",
      "https://realms.world/games",
    );
    expect(ecosystem.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "https://account.realms.world/velords",
    );
    expect(ecosystem.getByRole("link", { name: "Marketplace" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(ecosystem.getByRole("link", { name: "Scroll" })).toHaveAttribute(
      "href",
      "https://realms.world/scroll",
    );
    expect(
      screen.getByRole("link", { name: "Realms.World home" }),
    ).toHaveAttribute("href", "https://realms.world/");
    expect(screen.getByRole("link", { name: "Discord" })).toHaveAttribute(
      "href",
      "https://discord.gg/realmsworld",
    );
    expect(screen.getByRole("link", { name: "X / Twitter" })).toBeVisible();
    expect(screen.getByRole("link", { name: "GitHub" })).toBeVisible();
  });
  it("search normalises text and encodes the URL", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.type(
      screen.getByRole("textbox", { name: "Search" }),
      "  Realms   & gold  {enter}",
    );
    expect(mockPush).toHaveBeenCalledWith("/?q=Realms%20%26%20gold");
  });
  it("search follows back/forward URL query changes", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=first"));
    const { rerender } = render(<Header />);
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue(
      "first",
    );
    mockSearchParams.mockReturnValue(new URLSearchParams("q=second"));
    rerender(<Header />);
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue(
      "second",
    );
  });
  it("mobile menu includes trading, wallet and ecosystem destinations", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    const menu = within(
      screen.getByRole("dialog", { name: "Marketplace menu" }),
    );
    expect(
      menu.getByRole("link", { name: "Trading" }),
    ).toHaveAttribute("href", "/trader");
    expect(menu.getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "href",
      "/notifications",
    );
    expect(menu.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
    expect(menu.getByRole("link", { name: /Games/ })).toHaveAttribute(
      "href",
      "https://realms.world/games",
    );
    expect(menu.getByRole("link", { name: "Discord" })).toBeVisible();
  });

  it("login_opens_wallet_modal_with_all_connectors", async () => {
    const walletConnector = { id: "braavos", name: "Braavos" };
    const argentConnector = { id: "argentX", name: "Argent" };
    const controllerConnector = { id: "controller", name: "Controller" };
    mockUseConnect.mockReturnValue({
      connect: vi.fn(),
      connectAsync: mockConnect,
      connectors: [walletConnector, argentConnector, controllerConnector],
      pendingConnector: undefined,
      isPending: false,
    });
    const user = userEvent.setup();

    render(<Header />);
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(
      screen.getByRole("heading", { name: /select wallet/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /braavos/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /argent/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /controller/i })).toBeVisible();
  });

  it("wallet_modal_connects_selected_connector", async () => {
    const braavosConnector = { id: "braavos", name: "Braavos" };
    const controllerConnector = { id: "controller", name: "Controller" };
    mockUseConnect.mockReturnValue({
      connect: vi.fn(),
      connectAsync: mockConnect,
      connectors: [controllerConnector, braavosConnector],
      pendingConnector: undefined,
      isPending: false,
    });
    const user = userEvent.setup();

    render(<Header />);
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    await user.click(screen.getByRole("button", { name: /braavos/i }));

    expect(mockConnect).toHaveBeenCalledWith({ connector: braavosConnector });
  });

  it("wallet_modal_shows_connector_icons_when_available", async () => {
    const braavosConnector = {
      id: "braavos",
      name: "Braavos",
      icon: "https://cdn.example/braavos.png",
    };
    const controllerConnector = { id: "controller", name: "Controller" };
    mockUseConnect.mockReturnValue({
      connect: vi.fn(),
      connectAsync: mockConnect,
      connectors: [braavosConnector, controllerConnector],
      pendingConnector: undefined,
      isPending: false,
    });
    const user = userEvent.setup();

    render(<Header />);
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    const braavosButton = screen.getByRole("button", { name: /braavos/i });
    expect(within(braavosButton).getByAltText("Braavos icon")).toHaveAttribute(
      "src",
      "https://cdn.example/braavos.png",
    );
    expect(within(braavosButton).getByAltText("Braavos icon")).toHaveClass(
      "h-5",
      "w-5",
    );

    const controllerButton = screen.getByRole("button", {
      name: /controller/i,
    });
    expect(within(controllerButton).queryByRole("img")).toBeNull();
  });

  it("shows_wallet_address_badge_when_connected", () => {
    mockUseAccount.mockReturnValue({
      status: "connected",
      isConnected: true,
      isDisconnected: false,
      address: "0x1234567890abcdef",
    });

    render(<Header />);

    expect(screen.getByTestId("wallet-address")).toHaveTextContent(
      "0x1234...cdef",
    );
  });

  it("no_top_level_disconnect_button_when_connected", () => {
    mockUseAccount.mockReturnValue({
      status: "connected",
      isConnected: true,
      isDisconnected: false,
      address: "0x1234567890abcdef",
    });

    render(<Header />);

    // Disconnect must NOT be a top-level visible button; it lives inside the dropdown
    expect(screen.queryByRole("button", { name: /^disconnect$/i })).toBeNull();
  });

  it("wallet_dropdown_contains_profile_and_disconnect", async () => {
    mockUseAccount.mockReturnValue({
      status: "connected",
      isConnected: true,
      isDisconnected: false,
      address: "0x1234567890abcdef",
    });
    const user = userEvent.setup();

    render(<Header />);
    await user.click(screen.getByTestId("wallet-address"));

    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /disconnect/i })).toBeVisible();
  });

  it("disconnect_from_dropdown_calls_disconnect", async () => {
    mockUseAccount.mockReturnValue({
      status: "connected",
      isConnected: true,
      isDisconnected: false,
      address: "0x1234567890abcdef",
    });
    const user = userEvent.setup();

    render(<Header />);
    await user.click(screen.getByTestId("wallet-address"));
    await user.click(screen.getByRole("menuitem", { name: /disconnect/i }));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("profile_menuitem_links_to_wallet_profile_page", async () => {
    mockUseAccount.mockReturnValue({
      status: "connected",
      isConnected: true,
      isDisconnected: false,
      address: "0x1234567890abcdef",
    });
    const user = userEvent.setup();

    render(<Header />);
    await user.click(screen.getByTestId("wallet-address"));

    const profileItem = screen.getByRole("menuitem", { name: /profile/i });
    expect(profileItem.closest("a")).toHaveAttribute(
      "href",
      "/profile/0x1234567890abcdef",
    );
  });

  it("wallet_dropdown_not_shown_when_disconnected", () => {
    render(<Header />);

    expect(screen.queryByTestId("wallet-address")).toBeNull();
  });

  it("keeps rejected connections open and shows an actionable error", async () => {
    mockConnect.mockRejectedValueOnce(new Error("User rejected request"));
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    await user.click(screen.getByRole("button", { name: /controller/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "User rejected request",
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    mockConnect.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: /controller/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps a pending connection open and prevents duplicate requests", async () => {
    let resolve!: () => void;
    mockConnect.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    await user.click(screen.getByRole("button", { name: /controller/i }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: /controller/i })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => resolve());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("explains when a selected extension is missing", async () => {
    mockUseConnect.mockReturnValue({
      connectAsync: mockConnect,
      connectors: [{ id: "braavos", name: "Braavos", available: () => false }],
      isPending: false,
    });
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: /connect wallet/i }));
    await user.click(screen.getByRole("button", { name: /braavos/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("not detected");
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
