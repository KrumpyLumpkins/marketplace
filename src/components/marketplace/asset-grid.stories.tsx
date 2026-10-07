import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { CollectionBanner } from "@/features/collections/collection-banner";
import { CollectionBrowseLayout } from "@/features/collections/collection-browse-layout";
import { CURRENCY } from "../../../.storybook/scenario";
import { AssetGrid } from "./asset-grid";
import { MarketplaceTokenCard } from "./token-card";

const add = fn();
const meta = {
  title: "Marketplace/Asset layout",
  parameters: { layout: "fullscreen" },
  args: { density: "compact" },
  render: ({ density }) => (
    <main className="market-page space-y-4">
      <CollectionBanner name="Realms" image="/banners/realms.png">
        <span>8 listed · Floor 11 STRK</span>
      </CollectionBanner>
      <CollectionBrowseLayout activeCount={0} filters={<p>Collection traits</p>}>
        <AssetGrid density={density}>
          {Array.from({ length: 12 }, (_, i) => (
            <MarketplaceTokenCard
              key={i}
              token={{
                contract_address: "0xa",
                token_id: String(i + 1),
                metadata: { name: i === 0 ? "A very long realm name without losing its full accessible label" : `Realm #${i + 1}` },
                image: i === 2 ? null : "/banners/realms.png",
                amountsInBaseUnits: true,
              }}
              href={`/collections/0xa/${i + 1}`}
              price={i === 2 ? null : "11000000000000000000"}
              currency={CURRENCY}
              showActions
              onBuyNow={i === 2 ? undefined : add}
              buyNowLabel="Add to cart"
            />
          ))}
        </AssetGrid>
      </CollectionBrowseLayout>
    </main>
  ),
} satisfies Meta<{ density: "compact" | "dense" }>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comfortable: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getAllByRole("button", { name: "Add to cart" })[0]);
    await expect(add).toHaveBeenCalled();
    await userEvent.tab();
    await expect(canvas.getAllByRole("link", { name: "View" })[0]).toHaveFocus();
  },
};
export const Dense: Story = { args: { density: "dense" } };
