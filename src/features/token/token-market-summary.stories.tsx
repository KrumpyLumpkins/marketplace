import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { TokenMarketSummary } from "./token-market-summary";
import { CURRENCY } from "../../../.storybook/scenario";

const ETH = 10n ** 18n;
const LORDS =
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49";
const strk = (units: bigint) => (units * ETH).toString();

const meta = {
  title: "Marketplace/Token market summary",
  component: TokenMarketSummary,
  args: {
    price: strk(18n),
    currency: CURRENCY,
    topOffer: { amount: strk(15n), currency: CURRENCY },
    lastSale: { amount: strk(21n), currency: CURRENCY },
    listedCount: 1,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TokenMarketSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Listed: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Price")).toBeVisible();
    await expect(canvas.getByTestId("market-summary-price")).toHaveTextContent(
      "18 STRK",
    );
    await expect(
      canvas.getByTestId("market-summary-top-offer"),
    ).toHaveTextContent("15 STRK");
    await expect(
      canvas.getByTestId("market-summary-last-sale"),
    ).toHaveTextContent("21 STRK");
    await expect(canvas.queryByText(/open listings/)).not.toBeInTheDocument();
  },
};

export const Unlisted: Story = {
  args: {
    price: undefined,
    currency: undefined,
    topOffer: null,
    lastSale: null,
    listedCount: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not listed")).toBeVisible();
    await expect(canvas.getByText("No offers")).toBeVisible();
    await expect(canvas.getByText("No sales yet")).toBeVisible();
  },
};

export const SeveralListings: Story = {
  args: { listedCount: 3 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("3 open listings")).toBeVisible();
  },
};

export const MixedCurrencies: Story = {
  args: {
    topOffer: { amount: strk(1200n), currency: LORDS },
    lastSale: { amount: strk(950n), currency: LORDS },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("STRK")).toBeVisible();
    await expect(canvas.getAllByText("LORDS")).toHaveLength(2);
  },
};

export const LongAmounts: Story = {
  args: {
    price: "123456789123456789123456789123456789",
    topOffer: { amount: "98765432109876543210987654321", currency: CURRENCY },
  },
};

export const Explained: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "About price" })).toHaveFocus();
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("tooltip")).toHaveTextContent(
      "cheapest open listing",
    );
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "narrow", isRotated: false } },
};

export const Loading: Story = {
  args: { priceLoading: true, offersLoading: true, activityLoading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status", { name: "Loading price" })).toBeInTheDocument();
    await expect(canvas.queryByText("Not listed")).not.toBeInTheDocument();
    await expect(canvas.queryByText("No offers")).not.toBeInTheDocument();
  },
};
