import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResourceTraitIcons } from "./resource-trait-icons";
import { ResourceIcon, resourceIconSrc, resolveResourceIcon } from "./resource-icon";

describe("resource icons", () => {
  it("maps every Realm resource name to in-game artwork, whatever the spelling", () => {
    expect(resourceIconSrc("Cold Iron")).toBe("/resources/cold-iron.png");
    expect(resourceIconSrc("cold_iron")).toBe("/resources/cold-iron.png");
    expect(resourceIconSrc("ALCHEMICAL SILVER")).toBe("/resources/alchemical-silver.png");
    expect(resourceIconSrc("Twilight Quartz")).toBe("/resources/twilight-quartz.png");
    expect(resourceIconSrc("Dragonhide")).toBe("/resources/dragonhide.png");
    expect(resourceIconSrc("Knight T2")).toBe("/resources/knight-t2.png");
    expect(resourceIconSrc("Wheat")).toBe("/resources/wheat.png");
    expect(resourceIconSrc("Lords")).toBe("/resources/lords.png");
  });

  it("returns null for unknown resources and renders a lettered fallback", () => {
    expect(resourceIconSrc("Moonrock")).toBeNull();
    render(<ResourceIcon name="Moonrock" />);
    expect(screen.getByRole("img", { name: "Moonrock" })).toHaveTextContent("M");
  });

  it("uses the canonical label for display", () => {
    expect(resolveResourceIcon("coldiron")?.label).toBe("Cold Iron");
  });

  it("renders accessible icons with names available without hover", () => {
    render(<ResourceTraitIcons resources={["Wood", "Cold Iron"]} />);
    const list = screen.getByRole("list", { name: "Resources" });
    expect(within(list).getByRole("img", { name: "Wood" })).toHaveAttribute(
      "src",
      "/resources/wood.png",
    );
    expect(within(list).getByRole("img", { name: "Cold Iron" })).toBeVisible();
    expect(within(list).getByTitle("Cold Iron")).toBeInTheDocument();
  });

  it("shows labels in list layouts and collapses overflow with a count", () => {
    render(<ResourceTraitIcons resources={["Wood", "Stone", "Coal", "Gold"]} showLabels max={2} />);
    expect(screen.getByText("Wood")).toBeVisible();
    expect(screen.getByText("Stone")).toBeVisible();
    expect(screen.queryByText("Coal")).toBeNull();
    expect(screen.getByText("+2")).toBeVisible();
    expect(screen.getByTitle("Coal, Gold")).toBeInTheDocument();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<ResourceTraitIcons resources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
