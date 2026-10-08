import { describe, expect, it } from "vitest";
import {
  bucketListingsByPrice,
  bucketSalesByDay,
  formatCompact,
  niceTicks,
  percentChange,
  timeTicks,
  toDisplayNumber,
} from "./chart-utils";

const ETH = 10n ** 18n;

describe("chart utils", () => {
  it("converts base units to display numbers without float drift", () => {
    expect(toDisplayNumber((22n * ETH + 22n * 10n ** 16n).toString())).toBe(22.22);
    expect(toDisplayNumber("1500000", 6)).toBe(1.5);
    expect(toDisplayNumber("not-a-number")).toBeNull();
    expect(toDisplayNumber(null)).toBeNull();
  });

  it("formats compact labels", () => {
    expect(formatCompact(0.25)).toBe("0.25");
    expect(formatCompact(12.5)).toBe("12.5");
    expect(formatCompact(1234)).toBe("1.2K");
    expect(formatCompact(2_500_000)).toBe("2.5M");
    expect(formatCompact(450)).toBe("450");
  });

  it("produces clean axis ticks", () => {
    expect(niceTicks(0, 23)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(niceTicks(10, 10)).toEqual([0, 10]);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });

  it("snaps time ticks to UTC days on multi-day windows", () => {
    const start = 1_760_000_000;
    const ticks = timeTicks(start, start + 7 * 86400, 4);
    expect(ticks.every((t) => t % 86400 === 0)).toBe(true);
    expect(ticks[0]).toBeGreaterThanOrEqual(start);
  });

  it("buckets sales into days, filling quiet days with zero", () => {
    const start = 1_760_000_000;
    const buckets = bucketSalesByDay(
      [
        { timestamp: start + 10, price: (2n * ETH).toString() },
        { timestamp: start + 20, price: (3n * ETH).toString() },
        { timestamp: start + 2 * 86400, price: (1n * ETH).toString() },
      ],
      start,
      start + 2 * 86400,
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toMatchObject({ volume: 5, sales: 2 });
    expect(buckets[1]).toMatchObject({ volume: 0, sales: 0 });
    expect(buckets[2]).toMatchObject({ volume: 1, sales: 1 });
  });

  it("histograms listing prices into equal bands", () => {
    const buckets = bucketListingsByPrice([10, 11, 12, 20, 30], 2);
    expect(buckets).toEqual([
      { from: 10, to: 20, count: 3 },
      { from: 20, to: 30, count: 2 },
    ]);
    expect(bucketListingsByPrice([5, 5])).toEqual([{ from: 5, to: 5, count: 2 }]);
    expect(bucketListingsByPrice([])).toEqual([]);
  });

  it("computes percentage change only when both ends exist", () => {
    expect(percentChange(10, 12)).toBeCloseTo(20);
    expect(percentChange(null, 12)).toBeNull();
    expect(percentChange(0, 12)).toBeNull();
  });
});
