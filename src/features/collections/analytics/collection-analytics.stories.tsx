import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { CollectionAnalytics } from "./collection-analytics";
import { CURRENCY, useScenario } from "../../../../.storybook/scenario";

const meta = {
  title: "Marketplace/Collection analytics",
  component: CollectionAnalytics,
  args: { address: "0xa", currency: CURRENCY },
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Floor history, volume, sales and listing depth for one collection in the market currency. The period filter scopes every tile and chart; each chart has a table twin.",
      },
    },
  },
} satisfies Meta<typeof CollectionAnalytics>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByRole("img", { name: /floor price/i })).toBeVisible();
    await expect(canvas.getByRole("img", { name: /24 sales/i })).toBeVisible();
    await expect(canvas.getByRole("img", { name: /volume per day/i })).toBeVisible();
    await expect(canvas.getByRole("img", { name: /listings by price band/i })).toBeVisible();
    const floor = within(canvas.getByTestId("chart-floor-price"));
    await userEvent.click(floor.getByRole("radio", { name: "table" }));
    await expect(floor.getByRole("table")).toBeVisible();
    await userEvent.click(canvas.getByRole("radio", { name: "Last 30 days" }));
    await expect(canvas.getByText("30d gross, fees included")).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "empty" });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No floor history in this period.")).toBeVisible();
    await expect(canvas.getByText("No sales in this period.")).toBeVisible();
  },
};

export const Error: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "error" });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent("unavailable");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByRole("img", { name: /floor price/i })).toBeVisible();
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
  },
};
