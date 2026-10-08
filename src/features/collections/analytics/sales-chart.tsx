"use client";

import { useState } from "react";
import { Axes, CHART_MARGIN, ChartFrame, ChartTooltip } from "./chart-frame";
import { formatCompact, formatDayLabel, formatTimeLabel, linearScale, niceTicks, timeTicks } from "./chart-utils";

export type SalePoint = { timestamp: number; price: number; tokenId?: string };

type SalesChartProps = {
  sales: SalePoint[];
  windowStart: number;
  windowEnd: number;
  symbol: string;
  historyLimit?: number;
  loading?: boolean;
  refreshing?: boolean;
  summary?: React.ReactNode;
};

/** Each sale as a dot: price against time. Hover any dot for the token and exact price. */
export function SalesChart({
  sales,
  windowStart,
  windowEnd,
  symbol,
  historyLimit,
  loading,
  refreshing,
  summary,
}: SalesChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const capped = historyLimit !== undefined && sales.length >= historyLimit;
  const multiDay = windowEnd - windowStart > 2 * 86400;

  return (
    <ChartFrame
      title="Sales"
      subtitle={
        capped
          ? `Most recent ${historyLimit} sales in ${symbol}; earlier sales are summarised in the totals.`
          : `Every sale on this marketplace in ${symbol}.`
      }
      summary={summary}
      loading={loading}
      refreshing={refreshing}
      empty={sales.length === 0 ? "No sales in this period." : null}
      table={
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">Time (UTC)</th>
              <th className="px-2 py-1 font-medium">Item</th>
              <th className="px-2 py-1 text-right font-medium">Price ({symbol})</th>
            </tr>
          </thead>
          <tbody>
            {[...sales].sort((a, b) => b.timestamp - a.timestamp).map((sale, index) => (
              <tr key={`${sale.timestamp}-${index}`} className="border-t border-[color:var(--realm-border-etched)]">
                <td className="px-2 py-1">{formatTimeLabel(sale.timestamp)}</td>
                <td className="px-2 py-1">{sale.tokenId ? `#${sale.tokenId}` : "—"}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatCompact(sale.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, height) => {
        const max = Math.max(...sales.map((s) => s.price));
        const yTicks = niceTicks(0, max * 1.1);
        const yScale = linearScale([0, yTicks[yTicks.length - 1]], [height - CHART_MARGIN.bottom, CHART_MARGIN.top]);
        const xScale = linearScale([windowStart, windowEnd], [CHART_MARGIN.left + 6, width - CHART_MARGIN.right - 6]);
        const xTicks = timeTicks(windowStart, windowEnd, width < 480 ? 3 : 5);
        const hovered = hover !== null ? sales[hover] : null;
        return (
          <>
            <svg
              role="img"
              aria-label={`${sales.length} sales in ${symbol}, highest ${formatCompact(max)}`}
              width={width}
              height={height}
              className="block overflow-visible"
              onPointerLeave={() => setHover(null)}
            >
              <Axes
                width={width}
                height={height}
                yTicks={yTicks}
                yScale={yScale}
                xTicks={xTicks}
                xScale={xScale}
                formatY={formatCompact}
                formatX={(t) => (multiDay ? formatDayLabel(t) : formatTimeLabel(t).replace(/^.*?, /, ""))}
              />
              {sales.map((sale, index) => {
                const cx = xScale(sale.timestamp);
                const cy = yScale(sale.price);
                const active = hover === index;
                return (
                  <g key={`${sale.timestamp}-${index}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={active ? 6 : 4}
                      fill="var(--realm-accent-brass)"
                      fillOpacity={active ? 1 : 0.85}
                      stroke="var(--realm-bg-void)"
                      strokeWidth={2}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={12}
                      fill="transparent"
                      className="cursor-pointer"
                      onPointerEnter={() => setHover(index)}
                      onFocus={() => setHover(index)}
                      onBlur={() => setHover(null)}
                      tabIndex={-1}
                    />
                  </g>
                );
              })}
            </svg>
            {hovered ? (
              <ChartTooltip x={xScale(hovered.timestamp)} y={yScale(hovered.price)} width={width}>
                <p className="font-semibold text-foreground">
                  {formatCompact(hovered.price)} {symbol}
                </p>
                <p className="text-muted-foreground">
                  {hovered.tokenId ? `Item #${hovered.tokenId} · ` : ""}
                  {formatTimeLabel(hovered.timestamp)} UTC
                </p>
              </ChartTooltip>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
