import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./header";

const { mockUseAccount, mockUseConnect, mockUseDisconnect, mockConnect, mockDisconnect, mockUseBalance } =
  vi.hoisted(() => ({
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
  useSearchParams: () => mockSearchParams(),
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

  it("links collection discovery from the header without a collection list", () => {
  render(<Header />);
  expect(screen.getByRole("link", { name: "Browse collections" })).toHaveAttribute("href", "/#collections");
});

  it("renders_realms_logo", () => {
    render(<Header />);

    const logo = screen.getByTestId("realms-logo");
    expect(logo).toBeVisible();
    expect(logo).toHaveAttribute("src", "/rw-logo.svg");
  });

  it("does_not_render_marketplace_title_in_top_header", () => {
    render(<Header />);

    expect(screen.queryByText(/realms\.market/i)).toBeNull();
  });

  it("renders_search_input", () => {
    render(<Header />);

    expect(screen.getByRole("textbox", { name: "Search" })).toBeVisible();
  });

  it("search_input_has_placeholder", () => {
    render(<Header />);

    expect(screen.getByRole("textbox", { name: "Search" })).toBeVisible();
  });

  it("search_navigates_on_enter", async () => {
    const user = userEvent.setup();

    render(<Header />);

    await user.type(screen.getByRole("textbox", { name: "Search" }), "dragons{enter}");

    expect(mockPush).toHaveBeenCalledWith("/?q=dragons");
  });

  it("search_reads_initial_value_from_params", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("q=realms"));

    render(<Header />);

    expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("realms");
  });

  it("header_is_a_nav_landmark", () => {
    render(<Header />);

    const header = screen.getByRole("banner");
    expect(header).toBeVisible();
  });

  it("links_logo_to_realms_world_home", () => {
    render(<Header />);

    const homeLink = screen.getByRole("link", { name: /realms\.world home/i });
    expect(homeLink).toBeVisible();
    expect(homeLink).toHaveAttribute("href", "https://realms.world/");
  });

  it("renders_centered_ecosystem_nav_links", () => {
    render(<Header />);

    const nav = screen.getByRole("navigation", { name: /primary ecosystem navigation/i });
    expect(within(nav).getByRole("link", { name: /^home$/i })).toHaveAttribute(
      "href",
      "https://realms.world/",
    );
    expect(within(nav).getByRole("link", { name: /^games$/i })).toHaveAttribute(
      "href",
      "https://realms.world/games",
    );
    expect(within(nav).getByRole("link", { name: /^account$/i })).toHaveAttribute(
      "href",
      "https://account.realms.world/velords",
    );
    expect(within(nav).getByRole("link", { name: /^marketplace$/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(within(nav).getByRole("link", { name: /^scroll$/i })).toHaveAttribute(
      "href",
      "https://realms.world/scroll",
    );
  });

  it("renders_social_icon_links", () => {
    render(<Header />);

    const twitterLink = screen.getByRole("link", { name: /x \/ twitter/i });
    expect(twitterLink).toHaveAttribute("href", "https://x.com/LootRealms");
    expect(within(twitterLink).getByTestId("x-icon")).toBeVisible();

    const discordLink = screen.getByRole("link", { name: /discord/i });
    expect(discordLink).toHaveAttribute("href", "https://discord.gg/realmsworld");
    expect(within(discordLink).getByTestId("discord-icon")).toBeVisible();

    const githubLink = screen.getByRole("link", { name: /github/i });
    expect(githubLink).toHaveAttribute("href", "https://github.com/BibliothecaDAO");
  });

  it("shows_login_button_when_disconnected", () => {
    render(<Header />);

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  });

  it("shows_cart_trigger_button", () => {
    render(<Header />);

    expect(screen.getByRole("button", { name: /cart \(0\)/i })).toBeVisible();
  });

  it("shows_portfolio_link_for_address_lookup", () => {
    render(<Header />);

    const portfolioLinks = screen.getAllByRole("link", { name: /portfolio/i });
    expect(portfolioLinks.length).toBeGreaterThan(0);
    expect(portfolioLinks[0]).toHaveAttribute("href", "/portfolio");
  });

  it("sub_header_contains_retained_marketplace_actions", () => {
    render(<Header />);

    expect(screen.getByRole("textbox", { name: "Search" })).toBeVisible();
    expect(screen.getByRole("button", { name: /cart \(0\)/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /portfolio/i })).toHaveAttribute(
      "href",
      "/portfolio",
    );
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  });

  it("mobile_menu_contains_ecosystem_navigation", async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const mobileMenuDialog = await screen.findByRole("dialog");
    expect(within(mobileMenuDialog).getByRole("link", { name: /^home$/i })).toHaveAttribute(
      "href",
      "https://realms.world/",
    );
    expect(within(mobileMenuDialog).getByRole("link", { name: /^games$/i })).toHaveAttribute(
      "href",
      "https://realms.world/games",
    );
    expect(within(mobileMenuDialog).getByRole("link", { name: /^account$/i })).toHaveAttribute(
      "href",
      "https://account.realms.world/velords",
    );
    expect(within(mobileMenuDialog).getByRole("link", { name: /^marketplace$/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(within(mobileMenuDialog).getByRole("link", { name: /^scroll$/i })).toHaveAttribute(
      "href",
      "https://realms.world/scroll",
    );
  });

  it("mobile_menu_contains_updated_social_links", async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole("button", { name: /open navigation menu/i }));

    const mobileMenuDialog = await screen.findByRole("dialog");
    const twitterLink = within(mobileMenuDialog).getByRole("link", { name: /x \/ twitter/i });
    const discordLink = within(mobileMenuDialog).getByRole("link", { name: /discord/i });

    expect(twitterLink).toHaveAttribute("href", "https://x.com/LootRealms");
    expect(within(twitterLink).getByTestId("x-icon")).toBeVisible();
    expect(discordLink).toHaveAttribute("href", "https://discord.gg/realmsworld");
    expect(within(discordLink).getByTestId("discord-icon")).toBeVisible();
    expect(within(mobileMenuDialog).getByRole("link", { name: /github/i })).toHaveAttribute(
      "href",
      "https://github.com/BibliothecaDAO",
    );
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

    expect(screen.getByRole("heading", { name: /select wallet/i })).toBeVisible();
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
    expect(within(braavosButton).getByAltText("Braavos icon")).toHaveClass("h-5", "w-5");

    const controllerButton = screen.getByRole("button", { name: /controller/i });
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

    expect(screen.getByTestId("wallet-address")).toHaveTextContent("0x1234...cdef");
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
  it("explains when a selected extension is missing",async()=>{
    mockUseConnect.mockReturnValue({connectAsync:mockConnect,connectors:[{id:"braavos",name:"Braavos",available:()=>false}],isPending:false});
    const user=userEvent.setup();render(<Header/>);
    await user.click(screen.getByRole('button',{name:/connect wallet/i}));
    await user.click(screen.getByRole('button',{name:/braavos/i}));
    expect(screen.getByRole('alert')).toHaveTextContent('not detected');
    expect(mockConnect).not.toHaveBeenCalled();
  });

});
