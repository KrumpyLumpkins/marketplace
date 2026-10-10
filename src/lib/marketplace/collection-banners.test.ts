import { describe, expect, it } from "vitest";
import { getCollectionBannerImage, getCollectionImage } from "./collection-banners";

describe("getCollectionImage", () => {
  it("uses dedicated artwork for Cosmetics, matched case- and whitespace-insensitively", () => {
    expect(getCollectionImage("Cosmetics")).toBe("/collection-images/cosmetics.jpg");
    expect(getCollectionImage("  cosmetics ")).toBe("/collection-images/cosmetics.jpg");
  });

  it("falls back to the banner for collections without dedicated artwork", () => {
    expect(getCollectionImage("Realms")).toBe("/banners/realms.png");
  });

  it("returns null for unknown or missing names", () => {
    expect(getCollectionImage("Unknown")).toBeNull();
    expect(getCollectionImage(null)).toBeNull();
    expect(getCollectionImage("")).toBeNull();
  });
});

describe("getCollectionBannerImage", () => {
  it("does not reuse collection artwork as a Cosmetics banner", () => {
    expect(getCollectionBannerImage("Cosmetics")).toBeNull();
  });
});
