/**
 * Small, dependency-free helpers for the SVG market charts. Amounts arrive as
 * base-unit strings; charts work in display units (bigint-safe conversion).
 */

export type ChartPoint = { x: number; y: number };

const DAY = 86400;

/** Convert a base-unit amount to a display number without losing more than micro precision. */
export function toDisplayNumber(amount: string | bigint | null | undefined, decimals = 18): number | null {
  if (amount === null || amount === undefined) return null;
  try {
    const value = typeof amount === "bigint" ? amount : BigInt(amount);
    const scale = 10n ** BigInt(Math.max(decimals - 6, 0));
    return Number(value / scale) / 10 ** Math.min(decimals, 6);
  } catch {
    return null;
  }
}

/** Compact number formatting for axes and labels: 1.2K, 3.4M, 0.25. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3)}K`;
  if (abs >= 100) return trim(value, 0);
  if (abs >= 1) return trim(value, 2);
  return trim(value, 4);
}

function trim(value: number, digits = 1) {
  return value.toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, "$1");
}

/** Round "nice" tick values spanning [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) {
    return min === 0 ? [0, 1] : [0, max];
  }
  const span = max - min;
  const step = niceStep(span / Math.max(count, 1));
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

export function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  // Thresholds sit at the geometric midpoints of 1, 2, 5 and 10 so steps round to the nearest nice value.
  const factor = residual < 1.415 ? 1 : residual < 3.163 ? 2 : residual < 7.072 ? 5 : 10;
  return factor * magnitude;
}

export type Scale = (value: number) => number;

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** UTC-day bucket start for a unix timestamp. */
export function dayStart(timestamp: number) {
  return Math.floor(timestamp / DAY) * DAY;
}

export function formatDayLabel(timestamp: number, withYear = false) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function formatTimeLabel(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Evenly spaced time ticks across a window, snapped to UTC midnight when the span allows. */
export function timeTicks(start: number, end: number, count = 4): number[] {
  if (end <= start) return [start];
  const span = end - start;
  if (span >= DAY * (count - 1)) {
    const step = Math.max(DAY, Math.round(span / count / DAY) * DAY);
    const ticks: number[] = [];
    for (let t = dayStart(start) + (dayStart(start) < start ? DAY : 0); t <= end; t += step) {
      ticks.push(t);
    }
    return ticks.length ? ticks : [start, end];
  }
  const step = span / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(start + i * step));
}

export type SalesBucket = { day: number; volume: number; sales: number };

/** Groups sales into fixed-width time buckets with volume and count, filling quiet buckets with zero. */
export function bucketSales(
  sales: Array<{ timestamp: number; price: string }>,
  windowStart: number,
  windowEnd: number,
  bucketSeconds = DAY,
  decimals = 18,
): SalesBucket[] {
  const floorTo = (t: number) => Math.floor(t / bucketSeconds) * bucketSeconds;
  const buckets = new Map<number, SalesBucket>();
  for (let day = floorTo(windowStart); day <= windowEnd; day += bucketSeconds) {
    buckets.set(day, { day, volume: 0, sales: 0 });
  }
  for (const sale of sales) {
    const day = floorTo(sale.timestamp);
    const bucket = buckets.get(day) ?? { day, volume: 0, sales: 0 };
    bucket.volume += toDisplayNumber(sale.price, decimals) ?? 0;
    bucket.sales += 1;
    buckets.set(day, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.day - b.day);
}

/** Groups sales into UTC-day buckets with volume and count, filling empty days. */
export function bucketSalesByDay(
  sales: Array<{ timestamp: number; price: string }>,
  windowStart: number,
  windowEnd: number,
  decimals = 18,
) {
  return bucketSales(sales, windowStart, windowEnd, DAY, decimals);
}

/** Histogram of listing prices in `bins` equal-width price bands, cheapest first. */
export function bucketListingsByPrice(
  prices: number[],
  bins = 10,
): Array<{ from: number; to: number; count: number }> {
  const sorted = prices.filter((price) => Number.isFinite(price)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max === min) return [{ from: min, to: max, count: sorted.length }];
  const width = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    from: min + i * width,
    to: i === bins - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const price of sorted) {
    const index = Math.min(bins - 1, Math.floor((price - min) / width));
    buckets[index].count += 1;
  }
  return buckets;
}

/** Percentage change between the first and last defined value, or null when undefined. */
export function percentChange(first: number | null | undefined, last: number | null | undefined) {
  if (first === null || first === undefined || last === null || last === undefined || first === 0) {
    return null;
  }
  return ((last - first) / first) * 100;
}
