import { describe, expect, it } from "vitest";
import {
  collectionDiscoveryStateFromSearchParams,
  collectionDiscoveryStateToSearchParams,
  sortModeFromSearchParams,
  tabFromSearchParams,
} from "./collection-query-params";

describe("collection query params", () => {
  it("defaults sort, tab and search state", () => {
    const state = collectionDiscoveryStateFromSearchParams(new URLSearchParams());
    expect(state.sortMode).toBe("price-asc");
    expect(state.tab).toBe("items");
    expect(state.query).toBe("");
    expect(state.listedOnly).toBe(false);
    expect(state.activeFilters).toEqual({});
  });

  it("reads supported sort modes and ignores unknown ones", () => {
    expect(sortModeFromSearchParams(new URLSearchParams("sort=recent"))).toBe("recent");
    expect(sortModeFromSearchParams(new URLSearchParams("sort=bogus"))).toBe("price-asc");
  });

  it("reads the tab, search and listed-only flags", () => {
    const state = collectionDiscoveryStateFromSearchParams(
      new URLSearchParams("tab=analytics&q=%20dragon%20&listed=1&trait=Resource%3AGold"),
    );
    expect(state.tab).toBe("analytics");
    expect(state.query).toBe("dragon");
    expect(state.listedOnly).toBe(true);
    expect(state.activeFilters).toEqual({ Resource: new Set(["Gold"]) });
    expect(tabFromSearchParams(new URLSearchParams("tab=nope"))).toBe("items");
  });

  it("serialises only non-default state and drops the cursor", () => {
    const params = collectionDiscoveryStateToSearchParams(new URLSearchParams("cursor=abc&other=1"), {
      activeFilters: { Resource: new Set(["Gold"]) },
      sortMode: "price-desc",
      query: "fox",
      listedOnly: true,
      tab: "offers",
    });
    expect(params.get("cursor")).toBeNull();
    expect(params.get("other")).toBe("1");
    expect(params.getAll("trait")).toEqual(["Resource:Gold"]);
    expect(params.get("sort")).toBe("price-desc");
    expect(params.get("q")).toBe("fox");
    expect(params.get("listed")).toBe("1");
    expect(params.get("tab")).toBe("offers");

    const defaults = collectionDiscoveryStateToSearchParams(new URLSearchParams("tab=offers&q=x&listed=1"), {
      activeFilters: {},
      sortMode: "price-asc",
      query: "",
      listedOnly: false,
      tab: "items",
    });
    expect(defaults.toString()).toBe("");
  });
});
