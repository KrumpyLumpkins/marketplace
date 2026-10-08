import { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  useMarketplaceCollection,
  useMarketplaceCollectionTokens,
  useMarketplaceCollectionListings,
  useMarketplaceCollectionOrders,
  useMarketplaceToken,
  useMarketplaceTokenBalances,
  useMarketplaceClient,
} from "./react";
import {
  fetchTokenBalances,
  fetchCollectionTokens,
  fetchTraitNamesSummary,
  fetchTraitValues,
  ownedClient,
  marketplaceRequest,
} from "./api-client";
import { useMarketCurrency } from "./currency-store";
import { formatCurrencyAmount } from "./amount-display";
import type { ApiOrder, ApiToken, CollectionOrdersOptions } from "./types";
vi.mock("./config", () => ({
  getMarketplaceRuntimeConfig: () => ({ chainLabel: "LOCAL" }),
}));
const order: ApiOrder = {
  id: "LOCAL:0x9:0x2:1",
  maker: "0x2",
  nonce: "1",
  kind: "listing",
  state: "open",
  collection: "0xa",
  tokenId: "9007199254740993",
  currency: "0x1",
  buyerDebit: "2000000000000000000",
  expiry: "4000000000",
  royaltyAmount: "0",
  royaltyCap: "0",
  feeBps: 200,
  royaltyRecipient: "0x0",
};
const token: ApiToken = {
  id: "0xa:9007199254740993",
  collection: "0xa",
  tokenId: "9007199254740993",
  owner: "0x2",
  metadata: { name: "Realm", image: "/realm.png" },
  attributes: [{ name: "Power", value: 99 }],
  bestListing: order,
  listings: [order],
};
const configuration = {
  chain: "LOCAL",
  chainId: "0x1",
  marketplace: "0x9",
  feeBps: 200,
  feeRecipient: "0x40",
  currencies: [{ address: "0x6", decimals: 6, symbol: "TEST" }],
};
let requests: URL[] = [];
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}
function response(data: unknown) {
  return new Response(JSON.stringify({ data }));
}
beforeEach(() => {
  requests = [];
  useMarketCurrency.setState({ currency: "0x1" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input, "http://localhost");
      requests.push(url);
      const path = url.pathname;
      if (path.endsWith("/marketplace/config")) return response(configuration);
      if (path.includes("/traits"))
        return response([
          {
            name: "Power",
            kind: "number",
            values: [{ value: 99, count: "2" }],
          },
        ]);
      if (path.includes("/holdings") || path.endsWith("/tokens"))
        return response({ items: [token], nextCursor: "next-page" });
      if (path.includes("/tokens/")) return response(token);
      if (path.endsWith("/listings") || path.endsWith("/orders"))
        return response({
          items: [
            {
              ...order,
              currency: url.searchParams.get("currency"),
              state: url.searchParams.get("state") ?? "open",
            },
          ],
          nextCursor: null,
        });
      return response({
        address: "0xa",
        name: "Realms",
        tokenCount: "10000",
        listingCount: "50",
        floorByCurrency: [],
      });
    }),
  );
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
it("does not request missing/disabled collections and loads them when enabled", async () => {
  const { result, rerender } = renderHook(
    ({ address, enabled }) =>
      useMarketplaceCollection({ address }, { enabled }),
    { initialProps: { address: "", enabled: true }, wrapper: wrapper() },
  );
  expect(requests).toHaveLength(0);
  rerender({ address: "0xa", enabled: false });
  expect(requests).toHaveLength(0);
  rerender({ address: "0xa", enabled: true });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.metadata.name).toBe("Realms");
  expect(result.current.data?.totalSupply).toBe("10000");
});
it("filters across the API dataset with typed values, lossless IDs and bounded pagination", async () => {
  const { result } = renderHook(
    () =>
      useMarketplaceCollectionTokens({
        address: "0xa",
        limit: 500,
        tokenIds: ["0xa:0x20000000000001", "0x2"],
        attributeFilters: {
          Type: ["true", "false", "42", "rare", "9007199254740993"],
        },
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(
    JSON.parse(requests[0].searchParams.get("filters")!)[0].values,
  ).toEqual([true, false, 42, "rare", "9007199254740993"]);
  expect(JSON.parse(requests[0].searchParams.get("tokenIds")!)).toEqual([
    "9007199254740993",
    "2",
  ]);
  expect(requests[0].searchParams.get("limit")).toBe("100");
  expect(result.current.data?.page.tokens[0]).toMatchObject({
    token_id: "9007199254740993",
    price: order.buyerDebit,
    metadata: { attributes: [{ trait_type: "Power", value: 99 }] },
  });
  expect(result.current.data?.page.nextCursor).toBe("next-page");
});
it("retains server cursors and explicit numeric-range filters on subsequent pages", async () => {
  await fetchCollectionTokens({
    address: "0xa",
    cursor: "cursor",
    sort: "power-desc",
    currency: "0x6",
    filters: [{ name: "Power", min: 10, max: 100 }],
  });
  expect(requests[0].searchParams.get("cursor")).toBe("cursor");
  expect(JSON.parse(requests[0].searchParams.get("filters")!)).toEqual([
    { name: "Power", min: 10, max: 100 },
  ]);
});
it("refreshes listings when the user switches currency and respects an explicit currency", async () => {
  const { result, rerender } = renderHook(
    ({ currency }: { currency?: string }) =>
      useMarketplaceCollectionListings({ collection: "0xa", currency }),
    {
      initialProps: { currency: undefined as string | undefined },
      wrapper: wrapper(),
    },
  );
  await waitFor(() => expect(result.current.data?.[0].currency).toBe("0x1"));
  act(() => useMarketCurrency.setState({ currency: "0x2" }));
  await waitFor(() => expect(result.current.data?.[0].currency).toBe("0x2"));
  rerender({ currency: "0x3" });
  await waitFor(() => expect(result.current.data?.[0].currency).toBe("0x3"));
});
it("resolves collection-scoped token IDs and returns real listing identities", async () => {
  const { result } = renderHook(
    () =>
      useMarketplaceToken({
        collection: "0xa",
        tokenId: "0xa:0x20000000000001",
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(requests[0].pathname).toMatch(/9007199254740993$/);
  expect(result.current.data?.listings[0].id).toBe(order.id);
});
it("loads holdings across multiple collections instead of silently selecting the first", async () => {
  const { result } = renderHook(
    () =>
      useMarketplaceTokenBalances({
        accountAddresses: ["0x2"],
        contractAddresses: ["0xa", "0xb"],
        cursor: "second",
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(JSON.parse(requests[0].searchParams.get("collections")!)).toEqual([
    "0xa",
    "0xb",
  ]);
  expect(requests[0].searchParams.has("collection")).toBe(false);
  expect(result.current.data?.page?.balances[0].token?.token_id).toBe(
    token.tokenId,
  );
  expect(result.current.data?.page?.nextCursor).toBe("next-page");
});
it("supports individual-collection holdings and current-owner lookups without inventing burned balances", async () => {
  expect((await fetchTokenBalances({})).page?.balances).toEqual([]);
  await fetchTokenBalances({
    accountAddresses: ["0x2"],
    contractAddresses: ["0xa"],
    limit: 50,
  });
  expect(requests.at(-1)?.searchParams.get("collection")).toBe("0xa");
  expect(
    (
      await fetchTokenBalances({
        contractAddresses: ["0xa"],
        tokenIds: ["0x1"],
      })
    ).page?.balances[0].account_address,
  ).toBe("0x2");
  vi.mocked(fetch).mockResolvedValue(response({ ...token, owner: "0x0" }));
  expect(
    (await fetchTokenBalances({ contractAddresses: ["0xa"], tokenIds: ["1"] }))
      .page?.balances,
  ).toEqual([]);
});
it.each([
  ["Placed", "Sell", "open", "listing"],
  ["Canceled", "Buy", "cancelled", "token_offer"],
  ["Executed", undefined, "filled", null],
  [undefined, undefined, null, null],
] as const)(
  "loads the requested order feed %s/%s",
  async (status, category, state, kind) => {
    const { result } = renderHook(
      () =>
        useMarketplaceCollectionOrders({
          collection: "0xa",
          status: status as CollectionOrdersOptions["status"],
          category,
          currency: "0x6",
          limit: 25,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests[0].searchParams.get("state")).toBe(state);
    expect(requests[0].searchParams.get("kind")).toBe(kind);
  },
);
it("updates currency precision only after configuration is loaded, and exposes refresh errors", async () => {
  const { result } = renderHook(useMarketplaceClient, { wrapper: wrapper() });
  expect(result.current.status).toBe("loading");
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(formatCurrencyAmount("1200000", "0x6")).toBe("1.2");
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { message: "Offline", code: "RPC_UNAVAILABLE" },
      }),
      { status: 503 },
    ),
  );
  await act(async () => {
    await result.current.refresh();
  });
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error?.message).toBe("Offline");
});
it("preserves facet values and groups other selected values into one filter", async () => {
  expect(
    (await fetchTraitNamesSummary({ address: "0xa" })).pages[0].traits,
  ).toEqual([{ traitName: "Power", valueCount: 1 }]);
  const values = await fetchTraitValues({
    address: "0xa",
    traitName: "Power / Level",
    otherTraitFilters: [
      { name: "Shiny", value: "true" },
      { name: "Shiny", value: "false" },
    ],
  });
  expect(requests.at(-1)?.pathname).toContain("Power%20%2F%20Level");
  expect(JSON.parse(requests.at(-1)!.searchParams.get("filters")!)).toEqual([
    { name: "Shiny", values: [true, false] },
  ]);
  expect(values.pages[0].values).toEqual([{ traitValue: "99", count: 2 }]);
  expect(await ownedClient.getFees()).toMatchObject({
    feeDenominator: 10000,
    feeNum: 200,
    feeReceiver: "0x40",
  });
});

it("serializes wallet preflight requests losslessly and omits absent query options", async () => {
  const data = {
    account: "0x2",
    items: [{ maker: "0x3", nonce: "9007199254740993" }],
  };
  vi.mocked(fetch).mockResolvedValue(
    response({ canSubmit: false, reasons: ["INDEX_STALE"] }),
  );
  await expect(
    marketplaceRequest(
      "/checkout/preflight",
      { cursor: undefined, limit: null },
      data,
    ),
  ).resolves.toMatchObject({ canSubmit: false });
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).not.toContain("?");
  expect(new Headers(options?.headers).get("content-type")).toBe("application/json");
  expect(options).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify(data),

  });
});
it("turns an unstructured server failure into a visible API error", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 500 }));
  await expect(marketplaceRequest("/collections")).rejects.toMatchObject({
    code: "API_ERROR",
    message: "Marketplace request failed",
    status: 500,
  });
});
it("keeps inactive token, listing, order and ownership queries idle", () => {
  const { result } = renderHook(
    () => [
      useMarketplaceCollectionTokens({ address: "0xa" }, { enabled: false }),
      useMarketplaceCollectionListings(
        { collection: "0xa" },
        { enabled: false },
      ),
      useMarketplaceCollectionOrders({ collection: "0xa" }, { enabled: false }),
      useMarketplaceToken(
        { collection: "0xa", tokenId: "1" },
        { enabled: false },
      ),
      useMarketplaceTokenBalances(
        { accountAddresses: ["0x2"] },
        { enabled: false },
      ),
    ],
    { wrapper: wrapper() },
  );
  expect(
    result.current.every(
      (query) => query.fetchStatus === "idle" && !query.isEnabled,
    ),
  ).toBe(true);
  expect(requests).toHaveLength(0);
});
it("represents a token without orders and a facet with no values as empty, not failed", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      response({
        ...token,
        listings: undefined,
        bestListing: undefined,
        image: "/owned.png",
      }),
    )
    .mockResolvedValueOnce(response([]));
  const detail = await ownedClient.getToken({
    collection: "0xa",
    tokenId: "1",
  });
  expect(detail.listings).toEqual([]);
  expect(detail.token.image).toBe("/owned.png");
  expect(
    (await fetchTraitValues({ address: "0xa", traitName: "Power" })).pages[0]
      .values,
  ).toEqual([]);
});
