import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { CollectionActivityFeed } from "./collection-activity-feed";
import { useScenario } from "../../../.storybook/scenario";

const meta = {
  title: "Marketplace/Collection activity",
  component: CollectionActivityFeed,
  args: { address: "0xa" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <main className="market-page max-w-5xl">
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof CollectionActivityFeed>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const table = within(await canvas.findByRole("table"));
    await expect(table.getAllByRole("row")).toHaveLength(5);
    await expect(canvas.getByText("Showing 4 events")).toBeVisible();
    await expect(table.getByText("Mint")).toBeVisible();
    await expect(table.getByText("Collection offer")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Sales" }));
    await expect(canvas.getByRole("button", { name: "Sales" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(canvas.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await waitFor(() =>
      expect(within(canvas.getByRole("table")).getAllByRole("row")).toHaveLength(2),
    );
    const sales = within(canvas.getByRole("table"));
    await expect(sales.getByText("Sale")).toBeVisible();
    await expect(sales.queryByText("Transfer")).not.toBeInTheDocument();
    await expect(sales.queryByText("Listing")).not.toBeInTheDocument();
    await expect(sales.getByRole("link", { name: "#7" })).toHaveAttribute(
      "href",
      "/collections/0xa/7",
    );
    await expect(sales.getByText("21")).toBeVisible();
    await expect(canvas.getByText("Showing 1 event")).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "empty" });
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("No activity yet.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Offers" }));
    await expect(await canvas.findByText("No offers yet.")).toBeVisible();
  },
};

export const Error: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "error" });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Activity is unavailable",
    );
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeVisible();
  },
};

export const Loading: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "pending" });
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("status", { name: "Loading activity" }),
    ).toBeVisible();
    await expect(canvas.queryByText(/showing/i)).not.toBeInTheDocument();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const list = await canvas.findByRole("list", { name: "Collection activity" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
    await expect(
      within(list).getByRole("link", { name: "#7" }),
    ).toBeVisible();
    expect(
      canvasElement.ownerDocument.documentElement.scrollWidth,
    ).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
  },
};
