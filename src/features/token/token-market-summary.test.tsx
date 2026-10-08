import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiOrder } from "@/lib/marketplace/types";
import type { TokenActivityItem } from "./token-activity";
import {
  pickLastSale,
  pickTopOffer,
  TokenMarketSummary,
} from "./token-market-summary";

const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const LORDS =
  "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49";
const ETH = 10n ** 18n;
const strk = (units: bigint) => (units * ETH).toString();

describe("TokenMarketSummary", () => {
  it("shows the price, top offer and last sale with their currencies", () => {
    render(
      <TokenMarketSummary
        price={strk(18n)}
        currency={STRK}
        topOffer={{ amount: strk(15n), currency: STRK }}
        lastSale={{ amount: strk(21n), currency: LORDS }}
      />,
    );
    expect(screen.getByTestId("market-summary-price")).toHaveTextContent(
      "18 STRK",
    );
    expect(screen.getByTestId("market-summary-top-offer")).toHaveTextContent(
      "15 STRK",
    );
    expect(screen.getByTestId("market-summary-last-sale")).toHaveTextContent(
      "21 LORDS",
    );
  });

  it("names each empty state plainly", () => {
    render(<TokenMarketSummary />);
    expect(screen.getByText("Not listed")).toBeInTheDocument();
    expect(screen.getByText("No offers")).toBeInTheDocument();
    expect(screen.getByText("No sales yet")).toBeInTheDocument();
  });

  it("mentions additional open listings only when there are several", () => {
    const { rerender } = render(
      <TokenMarketSummary price={strk(18n)} currency={STRK} listedCount={3} />,
    );
    expect(screen.getByText("3 open listings")).toBeInTheDocument();
    rerender(
      <TokenMarketSummary price={strk(18n)} currency={STRK} listedCount={1} />,
    );
    expect(screen.queryByText(/open listing/)).toBeNull();
  });

  it("explains every label with a keyboard-reachable tip", () => {
    render(<TokenMarketSummary />);
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Top offer")).toBeInTheDocument();
    expect(screen.getByText("Last sale")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "About price" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "About top offer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "About last sale" }),
    ).toBeInTheDocument();
  });
});

function order(
  id: string,
  buyerDebit: string,
  currency = STRK,
  kind: ApiOrder["kind"] = "token_offer",
): ApiOrder {
  return {
    id,
    maker: "0x3",
    nonce: id,
    kind,
    state: "open",
    collection: "0xa",
    tokenId: kind === "collection_offer" ? null : "1",
    currency,
    buyerDebit,
    expiry: "4000000000",
    royaltyAmount: "0",
    royaltyCap: "0",
    royaltyRecipient: "0x0",
    feeBps: 200,
  };
}

describe("pickTopOffer", () => {
  it("returns the highest offer in the preferred currency", () => {
    expect(
      pickTopOffer(
        [
          order("a", strk(9n)),
          order("b", strk(40n), LORDS),
          order("c", strk(15n), STRK, "collection_offer"),
        ],
        STRK,
      ),
    ).toEqual({ amount: strk(15n), currency: STRK });
  });

  it("falls back to the currency of the leading offer", () => {
    expect(
      pickTopOffer([order("a", strk(9n), LORDS), order("b", strk(12n), LORDS), order("c", strk(50n))]),
    ).toEqual({ amount: strk(12n), currency: LORDS });
    expect(
      pickTopOffer([order("a", strk(9n), LORDS), order("b", strk(50n))], STRK),
    ).toEqual({ amount: strk(50n), currency: STRK });
  });

  it("ignores listings and unparsable amounts", () => {
    expect(
      pickTopOffer([order("a", strk(99n), STRK, "listing"), order("b", "oops"), order("c", strk(3n))]),
    ).toEqual({ amount: strk(3n), currency: STRK });
  });

  it("returns null without offers", () => {
    expect(pickTopOffer([])).toBeNull();
    expect(pickTopOffer([order("a", strk(99n), STRK, "listing")])).toBeNull();
  });
});

describe("pickLastSale", () => {
  const event = (
    id: string,
    type: string,
    timestamp: number,
    extra: Partial<TokenActivityItem> = {},
  ): TokenActivityItem => ({
    id,
    type,
    provenance: { timestamp },
    ...extra,
  });

  it("returns the most recent fill regardless of ordering", () => {
    expect(
      pickLastSale([
        event("old", "order_filled", 100, { buyerDebit: strk(5n), currency: STRK }),
        event("list", "order_created", 400, { buyerDebit: strk(9n), currency: STRK, kind: "listing" }),
        event("new", "order_filled", 300, { buyerDebit: strk(7n), currency: LORDS }),
      ]),
    ).toEqual({ amount: strk(7n), currency: LORDS });
  });

  it("returns null when nothing has sold or the sale has no amount", () => {
    expect(pickLastSale([])).toBeNull();
    expect(pickLastSale([event("t", "transfer", 10)])).toBeNull();
    expect(pickLastSale([event("f", "order_filled", 10)])).toBeNull();
  });
});
