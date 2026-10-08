import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { MarketplaceHeader } from "./marketplace-header";
import { MarketplaceFooter } from "./marketplace-footer";
import { MarketToolbar } from "@/features/trading/market-toolbar";
import { useScenario, cartItem } from "../../../.storybook/scenario";
import { useCartStore } from "@/features/cart/store/cart-store";
const meta = {
  title: "Marketplace/Navigation",
  component: MarketplaceHeader,
  globals: { viewport: { value: "desktop", isRotated: false } },
  parameters: { layout: "fullscreen" },
  render: () => (
    <>
      <MarketplaceHeader />
      <MarketToolbar />
      <main className="market-page">
        <h1 className="realm-title text-2xl">Explore Realms</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banners/realms.png"
          alt="Realms map"
          className="mt-4 aspect-[3/1] w-full rounded-lg object-cover"
        />
      </main>
      <MarketplaceFooter />
    </>
  ),
} satisfies Meta<typeof MarketplaceHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Desktop: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "Realms Market home" }),
    ).toHaveAttribute("href", "/");
    await expect(
      canvas.getByRole("navigation", { name: "Marketplace tools" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("navigation", { name: "Realms ecosystem" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Marketplace" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByRole("banner").getBoundingClientRect().height,
    ).toBe(108);
    await expect(canvas.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};
export const Connected: Story = {
  beforeEach() {
    useScenario.setState({ connected: true });
  },
};
export const CartWithItems: Story = {
  beforeEach() {
    useCartStore.setState({ items: [cartItem] });
  },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Cart (1)" }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("heading", {
        name: "Cart",
        
      }),
    ).toBeVisible();
  },
};
export const Mobile: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open navigation menu" }),
    );
    const menu = await body.findByRole("dialog", { name: "Marketplace menu" });
    await waitFor(() => expect(menu).toBeVisible());
    for (const name of ["Explore", "Portfolio", "Trading", "Notifications"])
      await expect(
        within(menu).getByRole("link", { name }),
      ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Open navigation menu" }),
      ).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Open search" }));
    const search = await body.findByRole("dialog", {
      name: "Search marketplace",
    });
    await waitFor(() =>
      expect(
        within(search).getByRole("textbox", { name: "Search" }),
      ).toHaveFocus(),
    );
    await userEvent.type(
      within(search).getByRole("textbox", { name: "Search" }),
      "Realms",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Open search" })).toHaveFocus(),
    );
    expect(
      canvasElement.ownerDocument.documentElement.scrollWidth,
    ).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
  },
};
export const MobileWallet: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open navigation menu" }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Connect Wallet" }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Controller" }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "SELECT WALLET" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(body.getByTestId("mobile-wallet-address"));
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Disconnect" }),
    );
    await expect(
      body.getByRole("button", { name: "Connect Wallet" }),
    ).toBeVisible();
  },
};
export const Demo: Story = {
  beforeEach() {
    useScenario.setState({ demo: true });
  },
};
export const PendingTransaction: Story = {
  beforeEach() {
    useScenario.setState({
      connected: true,
      tradeState: {
        stage: "submitted",
        hash: "0x123",
        message: "Waiting for acceptance…",
      },
    });
  },
};

export const Unavailable: Story = {
  beforeEach() {
    useScenario.setState({ marketStatus: "paused" });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Trading unavailable",
    );
  },
};
export const ConnectionError: Story = {
  beforeEach() {
    useScenario.setState({ marketStatus: "error" });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Market data unavailable",
    );
  },
};
export const TradingActive: Story = {
  parameters: { nextjs: { navigation: { pathname: "/trader" } } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "Trading" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByRole("link", { name: "Explore" }),
    ).not.toHaveAttribute("aria-current");
  },
};
