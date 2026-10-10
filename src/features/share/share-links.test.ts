import { describe, expect, it } from "vitest";
import { assetShareText, absoluteShareUrl, xShareUrl } from "./share-links";

describe("share links", () => {
  it("resolves page paths against the current origin", () => {
    expect(absoluteShareUrl("/collections/0xabc/4", "https://market.realms.world")).toBe(
      "https://market.realms.world/collections/0xabc/4",
    );
    expect(absoluteShareUrl("/collections/0xabc/4?tab=offers#x", "https://m.example/")).toBe(
      "https://m.example/collections/0xabc/4",
    );
  });

  it("mentions the price only when the asset is listed", () => {
    expect(assetShareText({ name: "Realms #4", price: "27.16 STRK" })).toBe(
      "Realms #4 for 27.16 STRK on Realms.market",
    );
    expect(assetShareText({ name: "Realms #4", price: null })).toBe("Realms #4 on Realms.market");
  });

  it("builds an X post intent with encoded text and link", () => {
    const url = new URL(
      xShareUrl({ text: "Realms #4 for 27.16 STRK", url: "https://m.example/collections/0xabc/4" }),
    );

    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toBe("Realms #4 for 27.16 STRK");
    expect(url.searchParams.get("url")).toBe("https://m.example/collections/0xabc/4");
  });
});
