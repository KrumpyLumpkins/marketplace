import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { MarketplaceLayout } from "./marketplace-layout";
import { Header } from "./header";
import { CollectionBrowseLayout } from "@/features/collections/collection-browse-layout";
import { CollectionBanner } from "@/features/collections/collection-banner";
import { AssetGrid } from "@/components/marketplace/asset-grid";
import { MarketplaceTokenCard } from "@/components/marketplace/token-card";

const meta = {
  title: "Marketplace/Full width navigation",
  parameters: { layout: "fullscreen" },
  render: () => (
    <>
      <Header />
      <MarketplaceLayout>
        <main className="market-page space-y-4">
          <CollectionBanner name="Realms" image="/banners/realms.png" />
          <CollectionBrowseLayout activeCount={0} filters={<p>Traits</p>}>
            <AssetGrid>
              {Array.from({ length: 12 }, (_, i) => (
                <MarketplaceTokenCard
                  key={i}
                  token={{ contract_address: "0xa", token_id: String(i), metadata: { name: `Realm #${i}` }, image: "/banners/realms.png" }}
                  href={`/collections/0xa/${i}`}
                />
              ))}
            </AssetGrid>
          </CollectionBrowseLayout>
        </main>
      </MarketplaceLayout>
    </>
  ),
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collection: Story = {
  play: async ({ canvas, userEvent }) => {
    const browse = canvas.getByRole("link", { name: "Browse collections" });
    await expect(browse).toHaveAttribute("href", "/#collections");
    browse.focus();
    await userEvent.tab();
    await expect(canvas.getByRole("textbox", { name: "Search" })).toHaveFocus();
    await expect(canvas.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("navigation", { name: "Collections" })).not.toBeInTheDocument();
  },
};
export const Mobile: Story = { ...Collection, globals: { viewport: { value: "mobile", isRotated: false } } };
