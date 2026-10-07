import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { BestBid } from "./best-bid";
import { useScenario } from "../../../.storybook/scenario";
const meta = {
  title: "Trading/Best offer",
  component: BestBid,
  args: { collection: "0xa", tokenId: "1", isOwner: true },
  beforeEach() {
    useScenario.setState({ connected: true });
  },
} satisfies Meta<typeof BestBid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FundedOffer: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await expect(
      await canvas.findByText(/Best executable offer: 1.86/),
    ).toBeVisible();
    await expect(canvas.getByText("Review offer")).toBeEnabled();
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await expect(
      await canvas.findByText(/Best executable offer/),
    ).toBeVisible();
  },
};
export const LimitedSearch: Story = {
  beforeEach() {
    useScenario.setState({ bidComplete: false });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await expect(await canvas.findByText(/search limit reached/)).toBeVisible();
  },
};
export const NoFundedOffer: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "empty" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await expect(
      await canvas.findByText("No executable offer found in checked orders."),
    ).toBeVisible();
  },
};
export const ReadOnlyVisitor: Story = {
  args: { isOwner: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await canvas.findByText(/Best executable offer/);
    await expect(canvas.queryByText("Review offer")).not.toBeInTheDocument();
  },
};
export const FundingUnavailable: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "error" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Offer funding is unavailable",
    );
  },
};
export const Checking: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "pending" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Find best funded offer"));
    await expect(
      await canvas.findByText("Checking offer funding…"),
    ).toBeDisabled();
  },
};
