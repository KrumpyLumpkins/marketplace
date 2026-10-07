import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
function OrderTabs() {
  return (
    <Tabs defaultValue="listings" className="max-w-lg">
      <TabsList aria-label="Order categories">
        <TabsTrigger value="listings">Listings</TabsTrigger>
        <TabsTrigger value="offers">Offers</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="listings">Your active listings</TabsContent>
      <TabsContent value="offers">Offers received</TabsContent>
      <TabsContent value="history">Completed trades</TabsContent>
    </Tabs>
  );
}
const meta = { title: "UI/Tabs", component: OrderTabs } satisfies Meta<
  typeof OrderTabs
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const KeyboardNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole("tab", { name: "Listings" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Offers" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent(
      "Offers received",
    );
  },
};
