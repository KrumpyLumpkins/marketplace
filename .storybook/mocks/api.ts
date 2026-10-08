import { fn } from "storybook/test";
import { CURRENCY, fixtureConfig, useScenario } from "../scenario";
export const marketplaceRequest = fn(
  async (path: string, _query?: unknown, body?: unknown) => {
    if (path === "/marketplace/config") return {...fixtureConfig, demo:useScenario.getState().demo};
    if (path === "/auth/session") return {account:null};
    if (path === "/collections/0xa/stats") return {days:7,byCurrency:[{currency:CURRENCY,volume:"42000000000000000000",sales:3,history:[]}],floors:[]};
    if (path.endsWith("/best-bid")) {
      const scenario = useScenario.getState();
      if (scenario.apiState === "pending") return new Promise(() => {});
      if (scenario.apiState === "error")
        throw new Error("Offer funding is unavailable. Try again.");
      return {
        best:
          scenario.apiState === "empty"
            ? null
            : {
                order: {
                  id: "LOCAL:0x900:0x3:1",
                  maker: "0x3",
                  nonce: "1",
                  kind: "collection_offer",
                  state: "open",
                  collection: "0xa",
                  tokenId: null,
                  currency: CURRENCY,
                  buyerDebit: "2000000000000000000",
                  expiry: "4000000000",
                  royaltyAmount: "0",
                  royaltyCap: "200000000000000000",
                  feeBps: 200,
                  royaltyRecipient: "0x4",
                },
                sellerProceeds: "1860000000000000000",
                checkedBlock: 100,
              },
        checked: 3,
        complete: scenario.bidComplete,
        label: scenario.bidComplete
          ? "Best executable offer"
          : "Best checked offer",
      };
    }
    if (path !== "/checkout/preflight")
      throw new Error(
        `No Storybook fixture for ${path}. Add one explicitly; live requests are disabled.`,
      );
    const input = body as {
      action?: string;
      items: Array<{
        maker: string;
        nonce: string;
        tokenId?: string;
        buyerDebit?: string;
      }>;
    };
    const valid = useScenario.getState().preflight === "valid";
    return {
      canSubmit: valid,
      reasons: [],
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      currency: CURRENCY,
      approvalAmount: "0",
      total: input.items
        .reduce(
          (sum, item) => sum + BigInt(item.buyerDebit ?? "2000000000000000000"),
          0n,
        )
        .toString(),
      rows: input.items.map((item) => ({
        key: `LOCAL:0x900:${item.maker}:${item.nonce}`,
        valid,
        message: valid ? undefined : "This listing is no longer available.",
        sellerProceeds: "1860000000000000000",
        protocolFee: "40000000000000000",
        royaltyAmount: "100000000000000000",
        needsNftApproval: true,
      })),
    };
  },
);

export { tokenFromApi } from "../../src/lib/marketplace/api-client";
