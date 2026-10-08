import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, waitFor } from "storybook/test";
import { OfferList } from "./offer-list";
import { Button } from "@/components/ui/button";
import { AcceptOffer } from "@/features/trading/accept-offer";
import { TransactionFeedback } from "@/features/trading/transaction-feedback";
import { signCalls } from "../../../.storybook/mocks/trade";
import type { ApiOrder } from "@/lib/marketplace/types";
import { CURRENCY, useScenario } from "../../../.storybook/scenario";
const order: ApiOrder = {
  id: "LOCAL:0x900:0x3:1",
  kind: "token_offer",
  state: "open",
  maker: "0x074c2664cfc8aff6b1e24befa444488f89a060f9a58550cd5ef1f9c4809a80c3",
  nonce: "1",
  collection: "0xa",
  tokenId: "783",
  currency: CURRENCY,
  buyerDebit: "125000000000000000000",
  expiry: String(Math.floor(Date.now() / 1000) + 86400 * 3),
  feeBps: 500,
  royaltyAmount: "0",
  royaltyCap: "0",
  royaltyRecipient: "0x0",
};
const meta = {
  title: "Marketplace/Asset offers",
  component: OfferList,
  args: {
    orders: [
      order,
      {
        ...order,
        id: "b",
        kind: "collection_offer",
        tokenId: null,
        buyerDebit: "98000000000000000000",
        maker: "0x2",
      },
      { ...order, id: "c", buyerDebit: "91000000000000000000", maker: "0x3" },
    ],
    onRetry: fn(),
    onMore: fn(),
  },
  decorators: [
    (Story) => (
      <main className="market-page max-w-3xl">
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof OfferList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Offers: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("125")).toBeVisible();
    await expect(canvas.getAllByText("STRK")).toHaveLength(3);
    await expect(canvas.getByText("Collection offer")).toBeVisible();
  },
};
export const Owner: Story = {
  args: {
    renderAction: () => (
      <Button variant="outline" size="sm">
        Review offer
      </Button>
    ),
  },
};
export const Loading: Story = { args: { orders: [], loading: true } };
export const Empty: Story = { args: { orders: [] } };
export const Unavailable: Story = {
  args: { orders: [], error: true },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Retry offers" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const MoreOffers: Story = {
  args: { hasMore: true },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Load more offers" }),
    );
    await expect(args.onMore).toHaveBeenCalledOnce();
  },
};
export const LongAmount: Story = {
  args: {
    orders: [{ ...order, buyerDebit: "123456789123456789123456789123456789" }],
  },
};

export const ReviewWithMultipleOffers: Story = {
  beforeEach() {
    useScenario.setState({ connected: true });
  },
  decorators: [
    (Story) => (
      <>
        <TransactionFeedback />
        <Story />
      </>
    ),
  ],
  args: {
    orders: [1, 2, 3].map((n) => ({
      ...order,
      id: `LOCAL:0x900:0x3:${n}`,
      maker: "0x3",
      nonce: String(n),
      buyerDebit: "2000000000000000000",
      feeBps: 200,
    })),
    renderAction: (order) => <AcceptOffer order={order} tokenId="783" />,
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = canvas.getByRole("list", { name: "Offers for this asset" });
    const top = list.getBoundingClientRect().top;
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Review offer" })[0],
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Confirm acceptance" }),
    );
    await waitFor(() => expect(body.getAllByRole("dialog")).toHaveLength(1));
    await expect(
      body.getByRole("dialog", { name: "Transaction complete" }),
    ).toBeVisible();
    await expect(list.getBoundingClientRect().top).toBe(top);
    await expect(signCalls).toHaveBeenCalledOnce();
  },
};
