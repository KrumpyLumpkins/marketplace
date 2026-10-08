import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, fn, waitFor } from "storybook/test";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { MarketPrice } from "@/components/marketplace/market-price";
import { CollectionBrowseLayout } from "@/features/collections/collection-browse-layout";
import { TokenActivity } from "@/features/token/token-activity";
import { ListingPurchase } from "@/features/token/listing-purchase";
import { MarketStatus } from "@/features/ops/market-status";
import { WalletIdentity } from "@/features/profile/wallet-identity";
import { CollectionStatsStrip } from "@/features/collections/collection-stats-strip";
import { NotificationsView } from "@/features/trading/notifications-view";
import { TraderDashboard } from "@/features/trading/trader-dashboard";
import { CURRENCY, fixtureConfig } from "../../.storybook/scenario";
const meta = {
  title: "Marketplace/UX",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConnectionEntry: Story = {
  render: () => (
    <WalletConnectButton>Connect wallet to continue</WalletConnectButton>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Connect wallet to continue" }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    ).toHaveTextContent("SELECT WALLET");
  },
};
export const Prices: Story = {
  render: () => (
    <div className="space-y-4">
      <p>
        Floor <MarketPrice amount="11000000000000000000" currency={CURRENCY} />
      </p>
      <p>
        <MarketPrice amount="1000000000000000001" currency={CURRENCY} />
      </p>
      <p>
        <MarketPrice />
      </p>
    </div>
  ),
  play: async ({ canvas }) => {
    expect(canvas.getByText("11").parentElement!).toBeVisible();
    expect(
      canvas.getByText("1.000000000000000001").parentElement!,
    ).toBeVisible();
    expect(canvas.getByText("Not listed")).toBeVisible();
  },
};
export const CollectionBrowser: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  render: () => (
    <CollectionBrowseLayout
      filters={
        <label className="flex gap-2">
          <input type="checkbox" />
          Gold
        </label>
      }
      activeCount={1}
    >
      <h2>Available NFTs</h2>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((n) => (
          <article className="realm-panel p-4" key={n}>
            Realm #{n}
            <MarketPrice amount="11000000000000000000" currency={CURRENCY} />
          </article>
        ))}
      </div>
    </CollectionBrowseLayout>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole("button", { name: "Filters (1)" });
    // The same story also supports desktop visual inspection, where the sidebar is persistent.
    if (getComputedStyle(trigger.parentElement!).display !== "none") {
      await userEvent.click(trigger);
      const body = within(canvasElement.ownerDocument.body);
      const dialog = await body.findByRole("dialog");
      await userEvent.click(
        within(dialog).getByRole("checkbox", { name: "Gold" }),
      );
      await expect(within(dialog).getByRole("checkbox")).toBeChecked();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Show results" }),
      );
      await waitFor(() =>
        expect(
          canvas.getByRole("heading", { name: "Available NFTs" }),
        ).toBeVisible(),
      );
    }
  },
};
const add = fn();
export const Purchase: Story = {
  render: () => (
    <ListingPurchase
      price="11000000000000000000"
      currency={CURRENCY}
      onAdd={add}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add to cart" }));
    expect(add).toHaveBeenCalledOnce();
    expect(canvas.getAllByRole("button")).toHaveLength(1);
  },
};
export const InCart: Story = {
  render: () => (
    <ListingPurchase
      price="11000000000000000000"
      currency={CURRENCY}
      inCart
      onAdd={add}
      onViewCart={fn()}
    />
  ),
};
export const Activity: Story = {
  render: () => (
    <TokenActivity
      chain="SN_MAIN"
      items={[
        {
          id: "sale",
          type: "order_filled",
          buyerDebit: "11000000000000000000",
          currency: CURRENCY,
          buyer: "0x1234",
          seller: "0x5678",
          provenance: { timestamp: 1791288000, transactionHash: "0xabc" },
        },
        {
          id: "listing",
          type: "order_created",
          kind: "listing",
          buyerDebit: "12000000000000000000",
          currency: CURRENCY,
          maker: "0x5678",
          provenance: { timestamp: 1791287000 },
        },
        {
          id: "transfer",
          type: "transfer",
          from: "0x0",
          to: "0x5678",
          provenance: { timestamp: 1791286000 },
        },
      ]}
    />
  ),
  play: async ({ canvas }) => {
    expect(canvas.getByText("11").parentElement!).toBeVisible();
    expect(
      canvas.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute("href", "https://starkscan.co/tx/0xabc");
    expect(canvas.getByText("Buyer")).toBeVisible();
  },
};
export const PublicStatus: Story = {
  render: () => <MarketStatus config={fixtureConfig} onRefresh={fn()} />,
  play: async ({ canvas }) => {
    expect(canvas.getByText("Ready for trading")).toBeVisible();
    expect(
      canvas.queryByLabelText("Operator access token"),
    ).not.toBeInTheDocument();
  },
};
export const DemoStatus: Story = {
  render: () => (
    <MarketStatus config={{ ...fixtureConfig, demo: true }} onRefresh={fn()} />
  ),
};
export const StaleStatus: Story = {
  render: () => (
    <MarketStatus
      config={{
        ...fixtureConfig,
        status: {
          ...fixtureConfig.status,
          safeForCheckout: false,
          reasons: ["HEAD_STALE", "INDEX_STALE"],
        },
      }}
      onRefresh={fn()}
    />
  ),
};
export const StatusUnavailable: Story = {
  render: () => <MarketStatus error onRefresh={fn()} />,
};
export const PublicWallet: Story = {
  render: () => <WalletIdentity address="0x1234567890abcdef" />,
  play: async ({ canvas }) => {
    expect(canvas.getByText("Wallet address")).toBeVisible();
    expect(
      canvas.queryByText("Connected wallet address:"),
    ).not.toBeInTheDocument();
  },
};

export const CollectionStatistics: Story = {
  render: () => <CollectionStatsStrip address="0xa" currency={CURRENCY} />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("523")).toBeVisible();
    await expect(canvas.getByText("24")).toBeVisible();
    await expect(canvas.getByText(/412/)).toBeVisible();
  },
};
export const NotificationsEntry: Story = {
  render: () => <NotificationsView />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Connect wallet to view notifications",
      }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog"),
      ).toBeVisible(),
    );
  },
};
export const TraderEntry: Story = {
  render: () => <TraderDashboard />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Connect Wallet" }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog"),
      ).toBeVisible(),
    );
  },
};
