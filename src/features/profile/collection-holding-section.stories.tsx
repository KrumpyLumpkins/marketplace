import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { CollectionHoldingSection } from "./collection-holding-section";
import { useScenario } from "../../../.storybook/scenario";
const meta = {
  title: "Portfolio/Collection holdings",
  component: CollectionHoldingSection,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <main className="market-page">
        <Story />
      </main>
    ),
  ],
  args: {
    collectionAddress: "0xa",
    collectionName: "Realms",
    density: "standard",
    tokenIds: Array.from({ length: 78 }, (_, i) => String(i + 1)),
  },
} satisfies Meta<typeof CollectionHoldingSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SeventyEightRealms: Story = {
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("link")).toHaveLength(78));
    await expect(
      canvas.getByRole("link", { name: "View token 78" }),
    ).toBeVisible();
  },
};
export const MoreThanOnePage: Story = {
  args: {
    tokenIds: Array.from({ length: 205 }, (_, i) => String(i + 1)),
    density: "compact",
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getAllByRole("link")).toHaveLength(205));
  },
};
export const Loading: Story = {
  beforeEach: () => {
    useScenario.setState({ apiState: "pending" });
  },
};
export const Failed: Story = {
  beforeEach: () => {
    useScenario.setState({ apiState: "error" });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Failed to load tokens for this collection."),
    ).toBeVisible();
  },
};
export const Empty: Story = {
  beforeEach: () => {
    useScenario.setState({ apiState: "empty" });
  },
};
