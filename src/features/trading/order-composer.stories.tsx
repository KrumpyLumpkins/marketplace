import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, waitFor } from "storybook/test";
import { TransactionFeedback } from "./transaction-feedback";
import { OrderComposer } from "./order-composer";
import { ADDRESS, useScenario } from "../../../.storybook/scenario";
import { signCalls } from "../../../.storybook/mocks/trade";
const meta = {
  title: "Trading/Order composer",
  component: OrderComposer,
  args: { collection: "0xa", tokenIds: ["1"], kind: "listing" },
  beforeEach() {
    useScenario.setState({ connected: true });
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <TransactionFeedback />
        <Story />
        <div data-testid="after-composer" />
      </div>
    ),
  ],
} satisfies Meta<typeof OrderComposer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Listing: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "2.5");
    await expect(canvas.getByTestId("seller-proceeds")).toHaveTextContent(
      "2.45 STRK",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "List for sale" }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("status"),
    ).toHaveTextContent("Trade confirmed");
    await expect(
      signCalls.mock.calls[0][0].map((call) => call.entrypoint),
    ).toEqual(["approve", "create_listing"]);
    await expect(signCalls.mock.calls[0][0].at(-1)?.calldata.at(-1)).toBe(
      "200",
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "Done",
      }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "List for sale" }),
      ).toHaveFocus(),
    );
  },
};
export const TokenOffer: Story = {
  args: { kind: "token_offer" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "1");
    await userEvent.click(canvas.getByRole("button", { name: "Make offer" }));
    await expect(
      signCalls.mock.calls[0][0].map((call) => call.entrypoint),
    ).toEqual(["approve", "create_offer"]);
  },
};
export const CollectionOffer: Story = {
  args: { kind: "collection_offer", tokenIds: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Make collection offer" }),
    );
    await expect(
      signCalls.mock.calls[0][0].map((call) => call.entrypoint),
    ).toEqual(["approve", "create_collection_offer"]);
  },
};
export const BulkReprice: Story = {
  args: {
    assets: [
      { collection: "0xa", tokenId: "1" },
      { collection: "0xa", tokenId: "2" },
    ],
    replaceIds: [`LOCAL:0x900:${ADDRESS}:1`, `LOCAL:0x900:${ADDRESS}:2`],
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "3");
    await userEvent.click(
      canvas.getByRole("button", { name: "Reprice selected" }),
    );
    await expect(
      signCalls.mock.calls[0][0].filter(
        (call) => call.entrypoint === "cancel_order",
      ),
    ).toHaveLength(2);
    await expect(
      signCalls.mock.calls[0][0].filter(
        (call) => call.entrypoint === "create_listing",
      ),
    ).toHaveLength(2);
  },
};
export const InvalidPrecision: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText("Price"),
      "1.0000000000000000001",
    );
    await userEvent.tab();
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Use at most 18 decimal places",
    );
    await expect(
      canvas.getByRole("button", { name: "List for sale" }),
    ).toBeDisabled();
    await expect(signCalls).not.toHaveBeenCalled();
  },
};
export const NoCreatorRoyalty: Story = {
  args: { kind: "token_offer" },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByLabelText("Maximum royalty percent"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Creator royalty")).toBeVisible();
    await expect(canvas.getByText("0%")).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Price"),
      "1.000000000000000001",
    );
    await expect(canvas.getByLabelText("Price")).toHaveValue(
      "1.000000000000000001",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Make offer" }));
    await expect(
      signCalls.mock.calls[0][0].at(-1)?.calldata.slice(-3, -1),
    ).toEqual(["0", "0"]);
  },
};
export const Disconnected: Story = {
  beforeEach() {
    useScenario.setState({ connected: false });
  },
};
export const Demo: Story = {
  beforeEach() {
    useScenario.setState({ demo: true });
  },
};
export const ConnectWithTermsPreserved: Story = {
  beforeEach() {
    useScenario.setState({ connected: false });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "2.5");
    await userEvent.click(
      canvas.getByRole("button", { name: "Connect wallet to trade" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Controller" }),
    );
    await expect(canvas.getByLabelText("Price")).toHaveValue("2.5");
    await expect(
      await canvas.findByRole("button", { name: "List for sale" }),
    ).toBeEnabled();
    await expect(signCalls).not.toHaveBeenCalled();
  },
};

export const OfferAwaitingConfirmation: Story = {
  args: { kind: "token_offer" },
  beforeEach() {
    useScenario.setState({ connected: true, tradeOutcome: "pending" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "5");
    const button = canvas.getByRole("button", { name: "Make offer" });
    const top = canvas
      .getByTestId("after-composer")
      .getBoundingClientRect().top;
    await userEvent.click(button);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(
        body.getByRole("dialog", { name: "Waiting for confirmation" }),
      ).toBeVisible(),
    );
    await expect(
      canvas.getByTestId("after-composer").getBoundingClientRect().top,
    ).toBe(top);
    await userEvent.keyboard("{Escape}");
    await expect(body.getByRole("dialog")).toBeVisible();
    await expect(signCalls).toHaveBeenCalledOnce();
  },
};

export const RejectedOffer: Story = {
  args: { kind: "token_offer" },
  beforeEach() {
    useScenario.setState({ connected: true, tradeOutcome: "rejected" });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "4.5");
    await userEvent.click(canvas.getByRole("button", { name: "Make offer" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "Transaction rejected",
    );
    await userEvent.click(body.getAllByRole("button", { name: "Close" })[0]);
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Make offer" })).toHaveFocus(),
    );
    await expect(canvas.getByLabelText("Price")).toHaveValue("4.5");
    await expect(signCalls).not.toHaveBeenCalled();
  },
};

export const OfferTerms: Story = {
  args: { kind: "token_offer" },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "10");
    await expect(canvas.getByTestId("seller-proceeds")).toHaveTextContent(
      "9.8 STRK",
    );
    await expect(
      canvas.queryByLabelText("Maximum royalty percent"),
    ).not.toBeInTheDocument();
  },
};

export const CreatorRoyalty: Story = {
  args: { collection: "0xb", kind: "collection_offer", tokenIds: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "10");
    await expect(canvas.getByText("Up to 5%")).toBeVisible();
    await expect(canvas.getByTestId("seller-proceeds")).toHaveTextContent(
      "9.3 STRK",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Make collection offer" }),
    );
    await expect(signCalls.mock.calls[0][0].at(-1)?.calldata).toContain(
      "500000000000000000",
    );
  },
};
export const CreatorRoyaltyMobile: Story = {
  ...CreatorRoyalty,
  globals: { viewport: { value: "mobile", isRotated: false } },
};

export const CollectionNotEnabled: Story = {
  args: { collection: "0xc", kind: "collection_offer", tokenIds: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "10");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Trading is not enabled",
    );
    await expect(
      canvas.getByRole("button", { name: "Make collection offer" }),
    ).toBeDisabled();
    await expect(canvas.getByText("Unavailable")).toBeVisible();
    await expect(canvas.getByTestId("seller-proceeds")).toHaveTextContent("—");
    await expect(signCalls).not.toHaveBeenCalled();
  },
};
