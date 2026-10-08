import {
  activeFiltersFromSearchParams,
  activeFiltersToSearchParams,
  type ActiveFilters,
} from "@/lib/marketplace/traits";

export type CollectionSortMode =
  | "recent"
  | "price-asc"
  | "price-desc"
  | "power-asc"
  | "power-desc"
  | "level-asc"
  | "level-desc"
  | "health-asc"
  | "health-desc"
  | "resource-count-asc"
  | "resource-count-desc";

const DEFAULT_SORT_MODE: CollectionSortMode = "price-asc";
const SORT_MODES = new Set<CollectionSortMode>([
  "recent",
  "price-asc",
  "price-desc",
  "power-asc",
  "power-desc",
  "level-asc",
  "level-desc",
  "health-asc",
  "health-desc",
  "resource-count-asc",
  "resource-count-desc",
]);

export const COLLECTION_TABS = ["items", "offers", "activity", "analytics"] as const;
export type CollectionTab = (typeof COLLECTION_TABS)[number];

export type CollectionDiscoveryState = {
  activeFilters: ActiveFilters;
  sortMode: CollectionSortMode;
  /** Free-text search within the collection (name or exact token id). */
  query: string;
  /** Only show tokens with a live listing. */
  listedOnly: boolean;
  tab: CollectionTab;
};

export function sortModeFromSearchParams(params: URLSearchParams): CollectionSortMode {
  const raw = params.get("sort");
  if (raw && SORT_MODES.has(raw as CollectionSortMode)) {
    return raw as CollectionSortMode;
  }

  return DEFAULT_SORT_MODE;
}

export function tabFromSearchParams(params: URLSearchParams): CollectionTab {
  const raw = params.get("tab");
  return raw && (COLLECTION_TABS as readonly string[]).includes(raw) ? (raw as CollectionTab) : "items";
}

export function collectionDiscoveryStateFromSearchParams(
  params: URLSearchParams,
): CollectionDiscoveryState {
  return {
    activeFilters: activeFiltersFromSearchParams(params),
    sortMode: sortModeFromSearchParams(params),
    query: (params.get("q") ?? "").trim().slice(0, 100),
    listedOnly: params.get("listed") === "1",
    tab: tabFromSearchParams(params),
  };
}

export function collectionDiscoveryStateToSearchParams(
  currentParams: URLSearchParams,
  state: Partial<CollectionDiscoveryState> & Pick<CollectionDiscoveryState, "activeFilters" | "sortMode">,
) {
  const nextParams = new URLSearchParams(currentParams.toString());
  nextParams.delete("cursor");
  nextParams.delete("trait");
  nextParams.delete("sort");
  nextParams.delete("q");
  nextParams.delete("listed");
  nextParams.delete("tab");

  const traitParams = activeFiltersToSearchParams(state.activeFilters);
  traitParams.getAll("trait").forEach((entry) => {
    nextParams.append("trait", entry);
  });

  if (state.sortMode !== DEFAULT_SORT_MODE) {
    nextParams.set("sort", state.sortMode);
  }
  const query = state.query?.trim();
  if (query) {
    nextParams.set("q", query.slice(0, 100));
  }
  if (state.listedOnly) {
    nextParams.set("listed", "1");
  }
  if (state.tab && state.tab !== "items") {
    nextParams.set("tab", state.tab);
  }

  return nextParams;
}
