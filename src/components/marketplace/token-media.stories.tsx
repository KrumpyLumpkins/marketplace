import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TokenMedia } from "./token-media";
const meta = {
  title: "Marketplace/Artwork loading",
  component: TokenMedia,
  decorators: [
    (Story) => (
      <div className="aspect-square w-full max-w-sm overflow-hidden rounded-lg">
        <Story />
      </div>
    ),
  ],
  args: { alt: "Realm artwork", sources: ["/banners/realms.png"] },
} satisfies Meta<typeof TokenMedia>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Artwork: Story = {};
export const Unavailable: Story = { args: { sources: [] } };
