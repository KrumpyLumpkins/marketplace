import { describe, it, expect } from "vitest";
import {
  parseRoyaltyBps,
  parseAmount,
  parseOrderKey,
  buildBuyMany,
  buildCreateOrder,
} from "./write-adapter";
const market = "0x99";
describe("owned transaction encoding", () => {
  it("encodes decimal prices without floating point", () => {
    expect(parseAmount("1.000000000000000001", 18)).toBe("1000000000000000001");
    expect(() => parseAmount("1.001", 2)).toThrow();
    expect(() => parseAmount("-1", 18)).toThrow();
  });
  it("rejects another chain or deployment order", () => {
    expect(() =>
      parseOrderKey("SN_MAIN:0x98:0x2:1", "SN_MAIN", market),
    ).toThrow();
    expect(parseOrderKey("SN_MAIN:0x99:0x2:1", "SN_MAIN", market)).toEqual({
      maker: "0x2",
      nonce: "1",
    });
  });
  it("cart calldata commits currency, maximum and deadline without client fees", () => {
    const calls = buildBuyMany(
      market,
      [{ maker: "0x2", nonce: "1" }],
      "0x8",
      "100",
      123,
    );
    expect(calls.entrypoint).toBe("buy_many");
    expect(calls.calldata).toEqual(["1", "0x2", "1", "0x8", "100", "0", "123"]);
  });
  it("distinguishes a real token zero from a collection offer", () => {
    const base = {
      marketplace: market,
      collection: "0x9",
      currency: "0x8",
      price: "100",
      expiry: 123,
      royaltyCap: "5",
      maxFeeBps: 200,
    };
    expect(
      buildCreateOrder({ ...base, kind: "token_offer", tokenId: "0" })
        .entrypoint,
    ).toBe("create_offer");
    expect(
      buildCreateOrder({ ...base, kind: "collection_offer" }).calldata,
    ).toEqual(["0x9", "0x8", "100", "0", "123", "5", "0", "200"]);
  });
});

it("parses royalty basis points without floating point rounding", () => {
  expect(parseRoyaltyBps("0.29")).toBe(29n);
  expect(parseRoyaltyBps("0")).toBe(0n);
  expect(parseRoyaltyBps("50")).toBe(5000n);
  expect(() => parseRoyaltyBps("0.001")).toThrow();
  expect(() => parseRoyaltyBps("50.01")).toThrow();
});
