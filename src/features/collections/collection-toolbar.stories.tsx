import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";
import { CollectionToolbar } from "./collection-toolbar";
import { ActiveFilterChips } from "./active-filter-chips";

const sortOptions = [
  { label: "Price", values: { asc: "price-asc", desc: "price-desc" }, defaultDirection: "asc" as const },
  { label: "Recent", values: { asc: "recent", desc: "recent" }, defaultDirection: "asc" as const },
  { label: "Resources", values: { asc: "resource-count-asc", desc: "resource-count-desc" }, defaultDirection: "desc" as const },
];

const meta = {
  title: "Marketplace/Collection toolbar",
  component: CollectionToolbar,
  args: {
    query: "",
    onQueryChange: fn(),
    listedOnly: false,
    onListedOnlyChange: fn(),
    sortMode: "price-asc",
    sortOptions,
    onSortModeChange: fn(),
    layout: "compact",
    onLayoutChange: fn(),
    resultSummary: "Showing 24 items, more available",
  },
  render: (args) => (
    <div className="space-y-3">
      <CollectionToolbar {...args} />
      <ActiveFilterChips
        activeFilters={{ Resource: new Set(["Gold", "Dragonhide"]), Cities: new Set(["range:10-18"]) }}
        onRemove={fn()}
        onClear={fn()}
      />
    </div>
  ),
} satisfies Meta<typeof CollectionToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Search this collection" }), "fox");
    await waitFor(() => expect(args.onQueryChange).toHaveBeenCalledWith("fox"));
    await userEvent.click(canvas.getByRole("switch", { name: "Listed only" }));
    await expect(args.onListedOnlyChange).toHaveBeenCalledWith(true);
    await userEvent.click(canvas.getByRole("radio", { name: "List" }));
    await expect(args.onLayoutChange).toHaveBeenCalledWith("list");
    await expect(canvas.getByRole("button", { name: "Remove filter Resource: Gold" })).toBeVisible();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "narrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth,
    );
  },
};
