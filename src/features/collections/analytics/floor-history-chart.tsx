"use client";

import { useMemo, useState } from "react";
import {
  Axes,
  CHART_MARGIN,
  ChartFrame,
  ChartTooltip,
} from "./chart-frame";
import {
  formatCompact,
  formatTimeLabel,
  formatDayLabel,
  linearScale,
  niceTicks,
  timeTicks,
} from "./chart-utils";

export type FloorPoint = { timestamp: number; price: number | null };

type FloorHistoryChartProps = {
  points: FloorPoint[];
  windowStart: number;
  windowEnd: number;
  symbol: string;
  loading?: boolean;
  refreshing?: boolean;
  summary?: React.ReactNode;
};

/** Step line of the cheapest listing over time; gaps mean no live listing. */
export function FloorHistoryChart({
  points,
  windowStart,
  windowEnd,
  symbol,
  loading,
  refreshing,
  summary,
}: FloorHistoryChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = useMemo(() => [...points].sort((a, b) => a.timestamp - b.timestamp), [points]);
  const defined = sorted.filter((p): p is { timestamp: number; price: number } => p.price !== null);
  const multiDay = windowEnd - windowStart > 2 * 86400;

  return (
    <ChartFrame
      title="Floor price"
      subtitle={`Cheapest live listing in ${symbol}. Gaps mean nothing was listed.`}
      summary={summary}
      loading={loading}
      refreshing={refreshing}
      empty={defined.length === 0 ? "No floor history in this period." : null}
      table={
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">Time (UTC)</th>
              <th className="px-2 py-1 text-right font-medium">Floor ({symbol})</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((point) => (
              <tr key={point.timestamp} className="border-t border-[color:var(--realm-border-etched)]">
                <td className="px-2 py-1">{formatTimeLabel(point.timestamp)}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {point.price === null ? "No listings" : formatCompact(point.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, height) => {
        const prices = defined.map((p) => p.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const pad = (max - min || max || 1) * 0.15;
        const yTicks = niceTicks(Math.max(0, min - pad), max + pad);
        const yScale = linearScale(
          [yTicks[0], yTicks[yTicks.length - 1]],
          [height - CHART_MARGIN.bottom, CHART_MARGIN.top],
        );
        const start = Math.min(windowStart, sorted[0]?.timestamp ?? windowStart);
        const xScale = linearScale([start, windowEnd], [CHART_MARGIN.left, width - CHART_MARGIN.right]);
        const xTicks = timeTicks(start, windowEnd, width < 480 ? 3 : 5);

        // Build step segments as point lists, breaking at gaps.
        const baseline = height - CHART_MARGIN.bottom;
        const segments: Array<Array<{ x: number; y: number }>> = [];
        let current: Array<{ x: number; y: number }> = [];
        sorted.forEach((point, index) => {
          const next = sorted[index + 1];
          const endX = xScale(next ? next.timestamp : windowEnd);
          if (point.price === null) {
            if (current.length) segments.push(current);
            current = [];
            return;
          }
          const y = yScale(point.price);
          current.push({ x: xScale(point.timestamp), y }, { x: endX, y });
        });
        if (current.length) segments.push(current);
        const linePath = (points: Array<{ x: number; y: number }>) =>
          points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
        const areaPath = (points: Array<{ x: number; y: number }>) =>
          `${linePath(points)} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;

        const hovered = hover !== null ? sorted[hover] : null;

        return (
          <>
            <svg
              role="img"
              aria-label={`Floor price in ${symbol} from ${formatCompact(defined[0].price)} to ${formatCompact(defined[defined.length - 1].price)}`}
              width={width}
              height={height}
              className="block overflow-visible"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const px = event.clientX - rect.left;
                let nearest = 0;
                for (let i = 0; i < sorted.length; i += 1) {
                  if (xScale(sorted[i].timestamp) <= px) nearest = i;
                }
                setHover(nearest);
              }}
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
              {segments.map((points, i) => (
                <g key={i}>
                  <path d={areaPath(points)} fill="var(--realm-accent-brass)" opacity={0.1} />
                  <path
                    d={linePath(points)}
                    fill="none"
                    stroke="var(--realm-accent-brass)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              ))}
              {hovered ? (
                <g aria-hidden>
                  <line
                    x1={xScale(hovered.timestamp)}
                    x2={xScale(hovered.timestamp)}
                    y1={CHART_MARGIN.top}
                    y2={baseline}
                    stroke="var(--realm-border-strong)"
                    strokeWidth={1}
                  />
                  {hovered.price !== null ? (
                    <circle
                      cx={xScale(hovered.timestamp)}
                      cy={yScale(hovered.price)}
                      r={5}
                      fill="var(--realm-accent-brass)"
                      stroke="var(--realm-bg-void)"
                      strokeWidth={2}
                    />
                  ) : null}
                </g>
              ) : null}
            </svg>
            {hovered ? (
              <ChartTooltip
                x={xScale(hovered.timestamp)}
                y={hovered.price === null ? CHART_MARGIN.top : yScale(hovered.price)}
                width={width}
              >
                <p className="font-semibold text-foreground">
                  {hovered.price === null ? "No listings" : `${formatCompact(hovered.price)} ${symbol}`}
                </p>
                <p className="text-muted-foreground">{formatTimeLabel(hovered.timestamp)} UTC</p>
              </ChartTooltip>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
