import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { CollectionOffersPanel } from "./collection-offers-panel";
import { CURRENCY, useScenario } from "../../../.storybook/scenario";

const meta = {
  title: "Marketplace/Collection offers",
  component: CollectionOffersPanel,
  args: { address: "0xa", currency: CURRENCY },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <main className="market-page max-w-3xl">
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof CollectionOffersPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    const list = within(await canvas.findByRole("list", { name: "Open offers" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(3);
    await expect(list.getByText("Collection offer")).toBeVisible();
    await expect(list.getAllByText("Token offer")).toHaveLength(2);
    await expect(list.getByRole("link", { name: "#7" })).toHaveAttribute(
      "href",
      "/collections/0xa/7",
    );
    await expect(list.getByText("15")).toBeVisible();
    await expect(list.getAllByText("Funding is checked at acceptance")).toHaveLength(3);

    const toggle = canvas.getByRole("button", { name: "Make collection offer" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(await canvas.findByRole("textbox", { name: "Price" })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(canvas.queryByRole("textbox", { name: "Price" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(toggle).toHaveFocus());
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};

export const Empty: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "empty" });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No open offers. Be the first to make one."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Make collection offer" }),
    ).toBeVisible();
  },
};

export const Error: Story = {
  beforeEach() {
    useScenario.setState({ apiState: "error" });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Offers are unavailable",
    );
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeVisible();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const list = await canvas.findByRole("list", { name: "Open offers" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(
      canvasElement.ownerDocument.documentElement.scrollWidth,
    ).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
  },
};
