import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import type { ApiOrder } from "@/lib/marketplace/types";
import { AcceptOffer } from "./accept-offer";
import { CURRENCY, useScenario } from "../../../.storybook/scenario";
import { signCalls } from "../../../.storybook/mocks/trade";
const order: ApiOrder = {
  id: "LOCAL:0x900:0x3:1",
  maker: "0x3",
  nonce: "1",
  kind: "collection_offer",
  state: "open",
  collection: "0xa",
  tokenId: null,
  currency: CURRENCY,
  buyerDebit: "2000000000000000000",
  expiry: "4000000000",
  royaltyAmount: "0",
  royaltyCap: "200000000000000000",
  feeBps: 200,
  royaltyRecipient: "0x4",
};
const meta = {
  title: "Trading/Offer review",
  component: AcceptOffer,
  args: { order, tokenId: "1" },
  beforeEach() {
    useScenario.setState({ connected: true });
  },
  parameters: {
    docs: {
      description: {
        component:
          "The real proceeds-confirmation component with explicit preflight fixtures. Wallet signing is simulated.",
      },
    },
  },
} satisfies Meta<typeof AcceptOffer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ReviewRequired: Story = {};
export const ConfirmProceeds: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Review offer"));
    await expect(
      await canvas.findByText(/You receive at least 1.86/),
    ).toBeVisible();
    await expect(signCalls).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByText("Confirm acceptance"));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Trade confirmed",
    );
    await expect(signCalls).toHaveBeenCalledOnce();
  },
};
export const Unavailable: Story = {
  beforeEach() {
    useScenario.setState({ preflight: "unavailable" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Review offer"));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "no longer available",
    );
    await expect(
      canvas.queryByText("Confirm acceptance"),
    ).not.toBeInTheDocument();
  },
};
