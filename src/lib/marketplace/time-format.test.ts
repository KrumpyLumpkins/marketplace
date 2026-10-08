import { describe, expect, it } from "vitest";
import { formatDateTime, formatRelativeTime } from "./time-format";

// Noon UTC keeps the calendar day stable in every timezone from UTC-12 to UTC+11.
const NOON_UTC = Date.UTC(2026, 9, 8, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOON_UTC / 1000);

function at(secondsAgo: number) {
  return NOW_SECONDS - secondsAgo;
}

describe("formatRelativeTime", () => {
  it("reports anything under a minute as just now, including future timestamps", () => {
    expect(formatRelativeTime(at(0), NOON_UTC)).toBe("just now");
    expect(formatRelativeTime(at(59), NOON_UTC)).toBe("just now");
    expect(formatRelativeTime(at(-120), NOON_UTC)).toBe("just now");
  });

  it("uses minutes below an hour", () => {
    expect(formatRelativeTime(at(60), NOON_UTC)).toBe("1m ago");
    expect(formatRelativeTime(at(4 * 60 + 30), NOON_UTC)).toBe("4m ago");
    expect(formatRelativeTime(at(59 * 60 + 59), NOON_UTC)).toBe("59m ago");
  });

  it("uses hours below a day", () => {
    expect(formatRelativeTime(at(3600), NOON_UTC)).toBe("1h ago");
    expect(formatRelativeTime(at(3 * 3600 + 1800), NOON_UTC)).toBe("3h ago");
    expect(formatRelativeTime(at(24 * 3600 - 1), NOON_UTC)).toBe("23h ago");
  });

  it("uses days below a week", () => {
    expect(formatRelativeTime(at(86_400), NOON_UTC)).toBe("1d ago");
    expect(formatRelativeTime(at(2 * 86_400 + 3600), NOON_UTC)).toBe("2d ago");
    expect(formatRelativeTime(at(7 * 86_400 - 1), NOON_UTC)).toBe("6d ago");
  });

  it("uses weeks below four weeks", () => {
    expect(formatRelativeTime(at(7 * 86_400), NOON_UTC)).toBe("1w ago");
    expect(formatRelativeTime(at(3 * 7 * 86_400 + 86_400), NOON_UTC)).toBe("3w ago");
    expect(formatRelativeTime(at(28 * 86_400 - 1), NOON_UTC)).toBe("3w ago");
  });

  it("falls back to a short date from four weeks on", () => {
    expect(formatRelativeTime(at(28 * 86_400), NOON_UTC)).toBe("Sep 10, 2026");
    expect(formatRelativeTime(at(400 * 86_400), NOON_UTC)).toBe("Sep 3, 2025");
  });

  it("defaults to the current time", () => {
    expect(formatRelativeTime(Math.floor(Date.now() / 1000) - 5 * 60)).toBe("5m ago");
  });

  it("labels invalid timestamps instead of throwing", () => {
    expect(formatRelativeTime(Number.NaN, NOON_UTC)).toBe("Unknown time");
  });
});

describe("formatDateTime", () => {
  it("renders a medium date with a short time for titles", () => {
    const text = formatDateTime(NOW_SECONDS);
    expect(text).toContain("Oct 8, 2026");
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it("labels invalid timestamps instead of throwing", () => {
    expect(formatDateTime(Number.POSITIVE_INFINITY)).toBe("Unknown time");
  });
});
