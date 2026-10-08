import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TraitFilterSidebar } from "@/features/collections/trait-filter-sidebar";
import type { ActiveFilters, TraitNameSummary, TraitValueRow } from "@/lib/marketplace/traits";
import { useState } from "react";

const { mockGetCollectionFilterConfig } = vi.hoisted(() => ({
  mockGetCollectionFilterConfig: vi.fn(),
}));

vi.mock("@/lib/marketplace/collection-filter-config", () => ({
  getCollectionFilterConfig: mockGetCollectionFilterConfig,
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    value,
    onValueChange,
  }: {
    value?: number[];
    onValueChange?: (nextValue: number[]) => void;
  }) => (
    <div data-testid="mock-slider">
      {(value ?? [0]).map((entry, index) => (
        <div key={`${entry}-${index}`} role="slider" aria-valuenow={entry} />
      ))}
      <button type="button" aria-label="apply slider range" onClick={() => onValueChange?.([2, 3])}>
        set-slider-range
      </button>
      <button type="button" aria-label="reset slider range" onClick={() => onValueChange?.([1, 3])}>
        reset-slider-range
      </button>
    </div>
  ),
}));

function traitName(name: string, valueCount = 1): TraitNameSummary {
  return { traitName: name, valueCount };
}

function traitValue(value: string, count = 1): TraitValueRow {
  return { traitValue: value, count };
}

function openTraitGroup(user: ReturnType<typeof userEvent.setup>, name: string) {
  return user.click(screen.getByRole("button", { name: new RegExp(name, "i") }));
}

type WrapperProps = {
  collectionAddress?: string;
  traitNames: TraitNameSummary[];
  traitValues?: TraitValueRow[] | null;
  activeFilters?: ActiveFilters;
  onActiveFiltersChange?: (filters: ActiveFilters) => void;
  isLoading?: boolean;
  isLoadingValues?: boolean;
  initialOpenTraitName?: string | null;
};

function SidebarWrapper({
  collectionAddress = "0xabc",
  traitNames,
  traitValues = null,
  traitValuesByGroup,
  activeFilters = {},
  onActiveFiltersChange,
  isLoading,
  isLoadingValues,
  initialOpenTraitName = null,
}: WrapperProps & { traitValuesByGroup?: Record<string, TraitValueRow[]> }) {
  const [openTraitName, setOpenTraitName] = useState<string | null>(initialOpenTraitName);
  const resolvedValues = traitValuesByGroup && openTraitName
    ? traitValuesByGroup[openTraitName] ?? null
    : traitValues;
  return (
    <TraitFilterSidebar
      collectionAddress={collectionAddress}
      traitNames={traitNames}
      activeFilters={activeFilters}
      onActiveFiltersChange={onActiveFiltersChange ?? vi.fn()}
      isLoading={isLoading}
      traitValues={resolvedValues}
      isLoadingValues={isLoadingValues}
      openTraitName={openTraitName}
      onOpenTraitNameChange={setOpenTraitName}
    />
  );
}

describe("trait filter sidebar", () => {
  beforeEach(() => {
    mockGetCollectionFilterConfig.mockReset();
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: [],
      overrides: {},
    });
  });

  it("trait_groups_are_collapsed_by_default_and_expand_on_click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[traitName("Background", 2)]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={onOpen}
      />,
    );

    expect(screen.queryByRole("searchbox")).toBeNull();

    await openTraitGroup(user, "Background");

    expect(onOpen).toHaveBeenCalledWith("Background");
  });

  it("only_one_trait_group_can_be_open_at_a_time", async () => {
    const user = userEvent.setup();

    render(
      <SidebarWrapper
        traitNames={[traitName("Background", 1), traitName("Eyes", 1)]}
        traitValuesByGroup={{
          Background: [traitValue("Blue")],
          Eyes: [traitValue("Big")],
        }}
        initialOpenTraitName="Background"
      />,
    );

    expect(screen.getByRole("button", { name: "Blue (1)" })).toBeVisible();

    await openTraitGroup(user, "Eyes");

    expect(screen.queryByRole("button", { name: "Blue (1)" })).toBeNull();
    expect(screen.getByRole("button", { name: "Big (1)" })).toBeVisible();
  });

  it("search_filters_values_inside_open_trait_group", async () => {
    const user = userEvent.setup();

    render(
      <SidebarWrapper
        traitNames={[traitName("Background", 3)]}
        traitValues={[traitValue("Blue"), traitValue("Red"), traitValue("Green")]}
        initialOpenTraitName="Background"
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: /search background/i }), "re");

    expect(screen.queryByRole("button", { name: "Blue (1)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Red (1)" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Green (1)" })).toBeVisible();
  });

  it("renders_trait_groups_and_toggles_selection", async () => {
    const onActiveFiltersChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SidebarWrapper
        traitNames={[traitName("Background", 2), traitName("Eyes", 2)]}
        traitValues={[traitValue("Blue"), traitValue("Red")]}
        onActiveFiltersChange={onActiveFiltersChange}
        initialOpenTraitName="Background"
      />,
    );

    expect(screen.getByText("Filters")).toBeVisible();
    expect(screen.getByText("Background")).toBeVisible();
    expect(screen.getByRole("button", { name: "Blue (1)" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Blue (1)" }));

    const nextFilters = onActiveFiltersChange.mock.calls[0][0] as ActiveFilters;
    expect(Array.from(nextFilters.Background)).toEqual(["Blue"]);
  });

  it("empty_state_shows_no_trait_data_message", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/No trait data/i)).toBeVisible();
  });

  it("loading_state_shows_loading_message", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
        isLoading
      />,
    );

    expect(screen.getByText(/loading/i)).toBeVisible();
  });

  it("renders_trait_names_from_summary", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[traitName("Background"), traitName("Eyes")]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Background")).toBeVisible();
    expect(screen.getByText("Eyes")).toBeVisible();
  });

  it("toggle_on_clicking_inactive_trait_adds_it_to_filters", async () => {
    const onActiveFiltersChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SidebarWrapper
        traitNames={[traitName("Background")]}
        traitValues={[traitValue("Blue")]}
        onActiveFiltersChange={onActiveFiltersChange}
        initialOpenTraitName="Background"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Blue (1)" }));

    const nextFilters = onActiveFiltersChange.mock.calls[0][0] as ActiveFilters;
    expect(nextFilters.Background).toBeDefined();
    expect(Array.from(nextFilters.Background)).toContain("Blue");
  });

  it("toggle_off_clicking_active_trait_removes_it_from_filters", async () => {
    const onActiveFiltersChange = vi.fn();
    const user = userEvent.setup();
    const activeFilters: ActiveFilters = { Background: new Set(["Blue"]) };

    render(
      <SidebarWrapper
        traitNames={[traitName("Background")]}
        traitValues={[traitValue("Blue")]}
        activeFilters={activeFilters}
        onActiveFiltersChange={onActiveFiltersChange}
        initialOpenTraitName="Background"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Blue (1)" }));

    const nextFilters = onActiveFiltersChange.mock.calls[0][0] as ActiveFilters;
    expect(nextFilters.Background).toBeUndefined();
  });

  it("clear_button_shows_when_active_filters_exist_and_resets_on_click", async () => {
    const onActiveFiltersChange = vi.fn();
    const user = userEvent.setup();
    const activeFilters: ActiveFilters = { Background: new Set(["Blue"]) };

    render(
      <SidebarWrapper
        traitNames={[traitName("Background")]}
        traitValues={[traitValue("Blue")]}
        activeFilters={activeFilters}
        onActiveFiltersChange={onActiveFiltersChange}
        initialOpenTraitName="Background"
      />,
    );

    const clearButton = screen.getByRole("button", { name: /clear/i });
    expect(clearButton).toBeVisible();

    await user.click(clearButton);

    expect(onActiveFiltersChange).toHaveBeenCalledWith({});
  });

  it("clear_button_hidden_when_no_active_filters", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[traitName("Background")]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows_count_from_trait_values", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[traitName("Background")]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={[traitValue("Blue", 42)]}
        openTraitName="Background"
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Blue (42)" })).toBeVisible();
  });

  it("open_group_shows_loading_state_for_values", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[traitName("Background")]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        isLoadingValues
        openTraitName="Background"
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "Loading trait values" })).toBeVisible();
  });

  it("badge_count_shown_for_active_filters_without_values_loaded", () => {
    render(
      <TraitFilterSidebar
        collectionAddress="0xabc"
        traitNames={[traitName("Background"), traitName("Eyes")]}
        activeFilters={{ Background: new Set(["Blue", "Red"]) }}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    const badges = screen.getAllByText("2");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0]).toBeVisible();
  });

  it("hides_traits_configured_for_the_active_collection", () => {
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: ["Eyes"],
      overrides: {},
    });

    render(
      <TraitFilterSidebar
        collectionAddress="0xbeast"
        traitNames={[traitName("Background"), traitName("Eyes")]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    expect(mockGetCollectionFilterConfig).toHaveBeenCalledWith("0xbeast");
    expect(screen.getByText("Background")).toBeVisible();
    expect(screen.queryByText("Eyes")).toBeNull();
  });

  it("renders_collection_ordered_traits_before_remaining_alpha_traits", () => {
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: [],
      orderedTraits: ["Beast", "Type", "Power"],
      overrides: {},
    });

    render(
      <TraitFilterSidebar
        collectionAddress="0xbeast"
        traitNames={[
          traitName("Level"),
          traitName("Power"),
          traitName("Prefix"),
          traitName("Type"),
          traitName("Beast"),
        ]}
        activeFilters={{}}
        onActiveFiltersChange={vi.fn()}
        traitValues={null}
        openTraitName={null}
        onOpenTraitNameChange={vi.fn()}
      />,
    );

    const labels = screen.getAllByRole("button").map((button) =>
      button.textContent?.replace("›", "").trim(),
    );

    expect(labels).toEqual(["Beast", "Type", "Power", "Level", "Prefix"]);
  });

  it("renders_boolean_filter_without_search_box", () => {
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: [],
      overrides: {
        Animated: { type: "boolean" },
      },
    });

    render(
      <SidebarWrapper
        collectionAddress="0xbeast"
        traitNames={[traitName("Animated")]}
        traitValues={[traitValue("Yes"), traitValue("No")]}
        initialOpenTraitName="Animated"
      />,
    );

    expect(screen.queryByRole("searchbox", { name: /search animated/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Yes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "No" })).toBeVisible();
  });

  it("renders_range_filter_with_two_slider_thumbs", () => {
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: [],
      overrides: {
        Level: { type: "range", min: 1, max: 3 },
      },
    });

    render(
      <SidebarWrapper
        collectionAddress="0xbeast"
        traitNames={[traitName("Level")]}
        traitValues={[traitValue("1"), traitValue("2"), traitValue("3")]}
        initialOpenTraitName="Level"
      />,
    );

    expect(screen.queryByRole("searchbox", { name: /search level/i })).toBeNull();
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("range_filter_emits_single_canonical_range_value", async () => {
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: [],
      overrides: {
        Level: { type: "range", min: 1, max: 3 },
      },
    });
    const onActiveFiltersChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SidebarWrapper
        collectionAddress="0xbeast"
        traitNames={[traitName("Level")]}
        traitValues={[traitValue("1"), traitValue("2"), traitValue("3")]}
        initialOpenTraitName="Level"
        onActiveFiltersChange={onActiveFiltersChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /apply slider range/i }));

    expect(onActiveFiltersChange).toHaveBeenCalledWith({
      Level: new Set(["__range__:2:3"]),
    });
  });

  it("renders_pills_filter_with_alpha_sort_hidden_counts_and_hidden_search", () => {
    mockGetCollectionFilterConfig.mockReturnValue({
      hiddenTraits: [],
      overrides: {
        Background: {
          type: "pills",
          sort: "alpha",
          showCount: false,
          hideSearch: true,
        },
      },
    });

    render(
      <SidebarWrapper
        collectionAddress="0xrealms"
        traitNames={[traitName("Background")]}
        traitValues={[traitValue("Red", 1), traitValue("Blue", 10)]}
        initialOpenTraitName="Background"
      />,
    );

    expect(screen.queryByRole("searchbox", { name: /search background/i })).toBeNull();
    const region = screen.getByRole("region");
    const valueButtons = within(region)
      .getAllByRole("button")
      .filter((button) => ["Blue", "Red"].includes(button.textContent ?? ""));

    expect(valueButtons.map((button) => button.textContent)).toEqual(["Blue", "Red"]);
    expect(screen.queryByRole("button", { name: /Blue \\(10\\)/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Red \\(1\\)/i })).toBeNull();
  });
});
