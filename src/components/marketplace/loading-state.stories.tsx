import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import {
  AssetGridSkeleton,
  ListSkeleton,
  TokenDetailSkeleton,
  PageSkeleton,
  HomeSkeleton,
  CollectionPageSkeleton,
} from "./loading-state";
const meta = {
  title: "Marketplace/Loading states",
  component: AssetGridSkeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AssetGridSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Assets: Story = {
  args: { label: "Loading assets", count: 6 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading assets",
    );
    await expect(canvas.queryAllByRole("button")).toHaveLength(0);
  },
};
export const Dense: Story = { args: { density: "dense", count: 10 } };
export const PortraitAssets: Story = {
  args: { mediaClassName: "aspect-[4/5]" },
};
export const Orders: Story = {
  render: () => <ListSkeleton label="Loading orders" />,
};
export const Activity: Story = {
  render: () => <ListSkeleton label="Loading activity" compact />,
};
export const Token: Story = { render: () => <TokenDetailSkeleton /> };
export const Page: Story = { render: () => <PageSkeleton /> };
export const Home: Story = { render: () => <HomeSkeleton /> };
export const Collection: Story = { render: () => <CollectionPageSkeleton /> };
