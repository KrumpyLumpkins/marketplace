import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import type { ApiOrder } from "@/lib/marketplace/types";
import { TransactionFeedback } from "./transaction-feedback";
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
  decorators: [
    (Story) => (
      <>
        <TransactionFeedback />
        <Story />
      </>
    ),
  ],
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
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByText("Review offer"));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByText(
          /You receive at least/,
        ),
      ).toBeVisible(),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByText("1.86"),
    ).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).getByText("0.04"),
    ).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).getByText("0.1"),
    ).toBeVisible();
    await expect(signCalls).not.toHaveBeenCalled();
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByText("Confirm acceptance"),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("status"),
    ).toHaveTextContent("Trade confirmed");
    await expect(signCalls).toHaveBeenCalledOnce();
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "Done",
      }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "View transaction" }),
      ).toHaveFocus(),
    );
  },
};
export const Unavailable: Story = {
  beforeEach() {
    useScenario.setState({ preflight: "unavailable" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByText("Review offer"));
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("alert"),
    ).toHaveTextContent("no longer available");
    await expect(
      within(canvasElement.ownerDocument.body).queryByText(
        "Confirm acceptance",
      ),
    ).not.toBeInTheDocument();
  },
};
