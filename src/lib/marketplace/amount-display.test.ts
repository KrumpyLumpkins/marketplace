import { expect, it } from "vitest";
import {
  formatCurrencyAmount,
  configureCurrencyDecimals,
} from "./amount-display";
it("never interprets small base-unit prices as whole tokens", () => {
  expect(formatCurrencyAmount("100", "0x1")).toBe("0.0000000000000001");
  expect(formatCurrencyAmount("123456789012345678901234567890", "0x1")).toBe(
    "123456789012.34567890123456789",
  );
});
it("uses the declared currency scale including zero decimals", () => {
  configureCurrencyDecimals([
    { address: "0x2", decimals: 6 },
    { address: "0x3", decimals: 0 },
  ]);
  expect(formatCurrencyAmount("1200000", "0x2")).toBe("1.2");
  expect(formatCurrencyAmount("100", "0x3")).toBe("100");
  expect(formatCurrencyAmount("0", "0x2")).toBe("0");
});
