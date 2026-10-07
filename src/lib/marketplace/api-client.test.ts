import { afterEach, describe, expect, it, vi } from "vitest";
import { marketplaceRequest, orderFromApi, tokenFromApi } from "./api-client";
afterEach(() => vi.unstubAllGlobals());
describe("owned marketplace interface", () => {
  it("keeps token IDs and buyer amounts as strings", () => {
    const t = tokenFromApi({
      id: "x",
      collection: "0x9",
      tokenId: "9007199254740993",
      owner: "0x2",
      metadata: { name: "Rare" },
      attributes: [],
    });
    expect(t.token_id).toBe("9007199254740993");
    expect(
      orderFromApi({
        id: "SN_MAIN:0x9:0x2:1",
        maker: "0x2",
        nonce: "1",
        kind: "listing",
        collection: "0x9",
        tokenId: "1",
        currency: "0x8",
        buyerDebit: "9007199254740993",
        expiry: "99",
        state: "open",
        royaltyAmount: "0",
        royaltyCap: "0",
        royaltyRecipient: "0x0",
      }).price,
    ).toBe("9007199254740993");
  });
  it("surfaces structured API errors instead of returning successful empty pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code: "INDEX_STALE", message: "Index behind" },
            }),
            { status: 503 },
          ),
        ),
    );
    await expect(marketplaceRequest("/collections")).rejects.toThrow(
      "Index behind",
    );
  });
});
