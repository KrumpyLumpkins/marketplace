import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { CurrencySwitcher } from "./currency-switcher";
import { CURRENCY, useScenario } from "../../../.storybook/scenario";
import { useMarketCurrency } from "@/lib/marketplace/currency-store";

const LORDS = "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49";
const SURVIVO = "0x42dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b";
const currencies = [
  { address: CURRENCY, symbol: "STRK", decimals: 18 },
  { address: LORDS, symbol: "LORDS", decimals: 18 },
  { address: SURVIVO, symbol: "SURVIVO", decimals: 18 },
];

const meta = {
  title: "Marketplace/Currency switcher",
  component: CurrencySwitcher,
  args: { currencies, showBalance: true },
  parameters: {
    docs: {
      description: {
        component:
          "Market currency scopes floors, listings, offers and statistics. Each option shows its token mark; arrow keys move between options and the selection is remembered per browser.",
      },
    },
  },
} satisfies Meta<typeof CurrencySwitcher>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("radio", { name: "STRK (selected)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(canvas.getByRole("radio", { name: "LORDS" }));
    await expect(canvas.getByRole("radio", { name: "LORDS (selected)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(useMarketCurrency.getState().currency).toBe(LORDS);
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("radio", { name: "SURVIVO" })).toHaveFocus();
  },
};

export const ConnectedWallet: Story = {
  beforeEach() {
    useScenario.setState({ connected: true });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("currency-balance")).toHaveTextContent("STRK");
  },
};

export const Explainer: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "About market currency" }));
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent("priced in one currency");
  },
};

export const SingleCurrency: Story = {
  args: { currencies: currencies.slice(0, 1), showBalance: false },
};

export const Narrow: Story = {
  globals: { viewport: { value: "narrow", isRotated: false } },
};
