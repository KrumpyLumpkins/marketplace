import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  formatTraitShare,
  traitAttributesFromMetadata,
  traitFilterHref,
  TraitGrid,
} from "./trait-grid";

const rarity = (name: string, value: string) => {
  const table: Record<string, { count: number; share: number }> = {
    "Resource:Wood": { count: 2000, share: 0.25 },
    "Resource:Cold Iron": { count: 100, share: 0.0125 },
    "Cities:4": { count: 800, share: 0.1 },
  };
  return table[`${name}:${value}`] ?? null;
};

describe("TraitGrid", () => {
  it("links every trait to the collection filtered by it", () => {
    render(
      <TraitGrid
        collectionAddress="0xa"
        attributes={[
          { name: "Cities", value: "4" },
          { name: "Order", value: "Order of Fox" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Traits" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Order of Fox/ })).toHaveAttribute(
      "href",
      "/collections/0xa?trait=Order%3AOrder+of+Fox",
    );
    expect(screen.getByRole("link", { name: /Cities/ })).toHaveAttribute(
      "href",
      "/collections/0xa?trait=Cities%3A4",
    );
    expect(screen.queryByText(/have this/)).toBeNull();
  });

  it("shows how many tokens share a trait when rarity is known", () => {
    render(
      <TraitGrid
        collectionAddress="0xa"
        rarity={rarity}
        attributes={[
          { name: "Cities", value: "4" },
          { name: "Order", value: "Order of Fox" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Cities/ })).toHaveTextContent(
      "10% have this",
    );
    expect(
      screen.getByRole("link", { name: /Order of Fox/ }),
    ).not.toHaveTextContent("have this");
  });

  it("groups resources into one card with in-game icons", () => {
    const { container } = render(
      <TraitGrid
        collectionAddress="0xa"
        rarity={rarity}
        attributes={[
          { name: "Resource", value: "Wood" },
          { name: "Cities", value: "4" },
          { name: "Resource", value: "Cold Iron" },
        ]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Traits" }).querySelectorAll(":scope > li"),
    ).toHaveLength(2);
    const resources = screen.getByRole("list", { name: "Resources" });
    expect(within(resources).getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector('img[src="/resources/wood.png"]')).not.toBeNull();
    expect(
      container.querySelector('img[src="/resources/cold-iron.png"]'),
    ).not.toBeNull();
    const coldIron = within(resources).getByRole("link", { name: /Cold Iron/ });
    expect(coldIron).toHaveAttribute(
      "href",
      "/collections/0xa?trait=Resource%3ACold+Iron",
    );
    expect(coldIron).toHaveTextContent("1.3% have this");
  });

  it("explains when nothing is indexed", () => {
    render(<TraitGrid collectionAddress="0xa" attributes={[]} />);
    expect(screen.getByText("No traits indexed.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("traitAttributesFromMetadata", () => {
  it("normalizes indexer and marketplace attribute shapes", () => {
    expect(
      traitAttributesFromMetadata({
        attributes: [
          { trait_type: "Power", value: 42 },
          { traitName: "Order", traitValue: "Fox" },
          { name: "Wonder", value: "" },
          { value: "orphan" },
          null,
          { trait_type: "Flag", value: true },
          { trait_type: "Power", value: 42 },
        ],
      }),
    ).toEqual([
      { name: "Power", value: "42" },
      { name: "Order", value: "Fox" },
      { name: "Flag", value: "true" },
    ]);
  });

  it("returns nothing for metadata without attributes", () => {
    expect(traitAttributesFromMetadata(null)).toEqual([]);
    expect(traitAttributesFromMetadata("Realm")).toEqual([]);
    expect(traitAttributesFromMetadata({ attributes: "none" })).toEqual([]);
  });
});

describe("trait helpers", () => {
  it("encodes filter links the way the collection page reads them", () => {
    expect(traitFilterHref("0xa", "Resource", "Cold Iron")).toBe(
      "/collections/0xa?trait=Resource%3ACold+Iron",
    );
    expect(traitFilterHref("0xa", "Order", "Order of the Fox")).toBe(
      "/collections/0xa?trait=Order%3AOrder+of+the+Fox",
    );
  });

  it("formats shares for reading at a glance", () => {
    expect(formatTraitShare(0.25)).toBe("25%");
    expect(formatTraitShare(0.1)).toBe("10%");
    expect(formatTraitShare(0.333)).toBe("33%");
    expect(formatTraitShare(0.0125)).toBe("1.3%");
    expect(formatTraitShare(0.0004)).toBe("<0.1%");
    expect(formatTraitShare(1)).toBe("100%");
  });
});
