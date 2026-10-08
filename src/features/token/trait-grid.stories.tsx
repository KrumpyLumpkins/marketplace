import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { TraitGrid, type TraitAttribute } from "./trait-grid";
import type { TraitRarity } from "./use-trait-rarity";

const realm: TraitAttribute[] = [
  { name: "Resource", value: "Wood" },
  { name: "Resource", value: "Coal" },
  { name: "Resource", value: "Cold Iron" },
  { name: "Resource", value: "Dragonhide" },
  { name: "Regions", value: "4" },
  { name: "Cities", value: "12" },
  { name: "Harbors", value: "5" },
  { name: "Rivers", value: "21" },
  { name: "Order", value: "Order of the Fox" },
  { name: "Wonder", value: "The Weeping Tower" },
];

const shares: Record<string, TraitRarity> = {
  "Resource:Wood": { count: 5015, share: 0.6269 },
  "Resource:Coal": { count: 3093, share: 0.3866 },
  "Resource:Cold Iron": { count: 1072, share: 0.134 },
  "Resource:Dragonhide": { count: 23, share: 0.0029 },
  "Regions:4": { count: 1950, share: 0.2438 },
  "Cities:12": { count: 870, share: 0.1088 },
  "Harbors:5": { count: 640, share: 0.08 },
  "Rivers:21": { count: 310, share: 0.0388 },
  "Order:Order of the Fox": { count: 500, share: 0.0625 },
  "Wonder:The Weeping Tower": { count: 1, share: 0.000125 },
};
const rarity = (name: string, value: string) => shares[`${name}:${value}`] ?? null;

const meta = {
  title: "Marketplace/Trait grid",
  component: TraitGrid,
  args: { collectionAddress: "0xa", attributes: realm, rarity },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TraitGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Realm: Story = {
  play: async ({ canvas }) => {
    const resources = canvas.getByRole("list", { name: "Resources" });
    await expect(within(resources).getAllByRole("link")).toHaveLength(4);
    await expect(
      canvas.getByRole("link", { name: /Dragonhide/ }),
    ).toHaveAttribute("href", "/collections/0xa?trait=Resource%3ADragonhide");
    await expect(
      canvas.getByRole("link", { name: /Order of the Fox/ }),
    ).toHaveAttribute("href", "/collections/0xa?trait=Order%3AOrder+of+the+Fox");
    await expect(canvas.getByText("63% have this")).toBeVisible();
    await expect(canvas.getByText("<0.1% have this")).toBeVisible();
  },
};

export const WithoutRarity: Story = {
  args: { rarity: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/have this/)).not.toBeInTheDocument();
    await expect(canvas.getByText("Cold Iron")).toBeVisible();
  },
};

export const UnknownResource: Story = {
  args: {
    attributes: [
      { name: "Resource", value: "Moonrock" },
      { name: "Cities", value: "3" },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Moonrock")).toBeVisible();
  },
};

export const NoTraits: Story = {
  args: { attributes: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No traits indexed.")).toBeVisible();
  },
};

export const Keyboard: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: /Wood/ })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: /Coal/ })).toHaveFocus();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "narrow", isRotated: false } },
};
