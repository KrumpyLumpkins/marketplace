import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { OrderAmountInput } from "./order-amount-input";
import { CURRENCY } from "../../../.storybook/scenario";
const currencies = [
  { address: CURRENCY, symbol: "STRK", decimals: 18 },
  {
    address:
      "0x124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
    symbol: "LORDS",
    decimals: 18,
  },
];
function Example(args: {
  initialValue?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(args.initialValue ?? "");
  const [currency, setCurrency] = useState(CURRENCY);
  return (
    <OrderAmountInput
      value={value}
      onChange={setValue}
      currency={currency}
      onCurrencyChange={setCurrency}
      currencies={currencies}
      error={args.error}
      disabled={args.disabled}
    />
  );
}
const meta = {
  title: "Trading/Price input",
  component: Example,
  decorators: [
    (Story) => (
      <div className="market-page max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const DecimalAmount: Story = { args: { initialValue: "125.5" } };
export const LongAmount: Story = {
  args: { initialValue: "9007199254740993.000000000000000001" },
};
export const Invalid: Story = {
  args: {
    initialValue: "1.0000000000000000001",
    error: "Use at most 18 decimal places.",
  },
};
export const Disabled: Story = { args: { initialValue: "50", disabled: true } };
export const ExactInputAndCurrency: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const input = canvas.getByLabelText("Price");
    const faces = await document.fonts.load(`16px ${getComputedStyle(input).fontFamily}`);
    await expect(faces.length).toBeGreaterThan(0);
    await userEvent.type(input, "9007199254740993.000000000000000001");
    await expect(input).toHaveValue("9007199254740993.000000000000000001");
    await expect(input).toHaveAttribute("inputmode", "decimal");
    await userEvent.click(canvas.getByRole("combobox", { name: "Currency" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "LORDS",
      }),
    );
    await expect(
      canvas.getByRole("combobox", { name: "Currency" }),
    ).toHaveTextContent("LORDS");
    await expect(input).toHaveValue("9007199254740993.000000000000000001");
  },
};
