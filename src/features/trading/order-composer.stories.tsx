import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
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
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OrderComposer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Listing: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "2.5");
    await expect(canvas.getByText(/Minimum seller proceeds/)).toHaveTextContent(
      "2.2 STRK",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "List for sale" }),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Trade confirmed",
    );
    await expect(
      signCalls.mock.calls[0][0].map((call) => call.entrypoint),
    ).toEqual(["approve", "create_listing"]);
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
    await userEvent.click(
      canvas.getByRole("button", { name: "List for sale" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Use at most 18 decimal places",
    );
    await expect(signCalls).not.toHaveBeenCalled();
  },
};
export const InvalidRoyalty: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText("Price"), "1");
    await userEvent.clear(canvas.getByLabelText("Maximum royalty percent"));
    await userEvent.type(
      canvas.getByLabelText("Maximum royalty percent"),
      "51",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "List for sale" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "between 0 and 50%",
    );
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
  beforeEach() { useScenario.setState({connected:false}); },
  play: async ({canvas,canvasElement,userEvent}) => {
    await userEvent.type(canvas.getByLabelText("Price"),"2.5");
    await userEvent.click(canvas.getByRole("button",{name:"Connect wallet to trade"}));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("button",{name:"Controller"}));
    await expect(canvas.getByLabelText("Price")).toHaveValue("2.5");
    await expect(await canvas.findByRole("button",{name:"List for sale"})).toBeEnabled();
    await expect(signCalls).not.toHaveBeenCalled();
  },
};
