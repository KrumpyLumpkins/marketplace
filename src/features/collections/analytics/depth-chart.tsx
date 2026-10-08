"use client";

import { useState } from "react";
import { Axes, CHART_MARGIN, ChartFrame, ChartTooltip } from "./chart-frame";
import { formatCompact, linearScale, niceTicks } from "./chart-utils";

export type DepthBucket = { from: number; to: number; count: number };

type DepthChartProps = {
  buckets: DepthBucket[];
  listingCount: number;
  sampled: boolean;
  symbol: string;
  loading?: boolean;
  refreshing?: boolean;
  summary?: React.ReactNode;
};

/** How many listings sit in each price band above the floor: the depth a sweep would walk through. */
export function DepthChart({ buckets, listingCount, sampled, symbol, loading, refreshing, summary }: DepthChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const range = (bucket: DepthBucket) =>
    bucket.from === bucket.to
      ? `${formatCompact(bucket.from)} ${symbol}`
      : `${formatCompact(bucket.from)} to ${formatCompact(bucket.to)} ${symbol}`;

  return (
    <ChartFrame
      title="Listing depth"
      subtitle={
        sampled
          ? `Cheapest ${listingCount} listings grouped by price band.`
          : `${listingCount} live listing${listingCount === 1 ? "" : "s"} grouped by price band.`
      }
      summary={summary}
      loading={loading}
      refreshing={refreshing}
      empty={buckets.length === 0 ? `No live listings in ${symbol}.` : null}
      table={
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">Price band</th>
              <th className="px-2 py-1 text-right font-medium">Listings</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket, index) => (
              <tr key={index} className="border-t border-[color:var(--realm-border-etched)]">
                <td className="px-2 py-1">{range(bucket)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, height) => {
        const max = Math.max(...buckets.map((b) => b.count));
        const yTicks = niceTicks(0, max * 1.1).filter((t) => Number.isInteger(t));
        const yScale = linearScale([0, yTicks[yTicks.length - 1] || 1], [height - CHART_MARGIN.bottom, CHART_MARGIN.top]);
        const plotLeft = CHART_MARGIN.left;
        const plotRight = width - CHART_MARGIN.right;
        const slot = (plotRight - plotLeft) / Math.max(buckets.length, 1);
        const barWidth = Math.min(24, Math.max(3, slot - 2));
        const baseline = height - CHART_MARGIN.bottom;
        const tickEvery = Math.max(1, Math.ceil(buckets.length / (width < 480 ? 3 : 5)));
        const xScale = (index: number) => plotLeft + index * slot + slot / 2;
        const hovered = hover !== null ? buckets[hover] : null;
        return (
          <>
            <svg
              role="img"
              aria-label={`Listings by price band in ${symbol}, up to ${max} in one band`}
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
                xTicks={buckets.map((_, i) => i).filter((i) => i % tickEvery === 0)}
                xScale={xScale}
                formatY={(t) => String(t)}
                formatX={(i) => formatCompact(buckets[i].from)}
              />
              {buckets.map((bucket, index) => {
                const x = plotLeft + index * slot + (slot - barWidth) / 2;
                const y = yScale(bucket.count);
                const h = Math.max(0, baseline - y);
                const active = hover === index;
                return (
                  <g key={index}>
                    {h > 0 ? (
                      <path
                        d={`M${x},${baseline} V${y + 4} a4,4 0 0 1 4,-4 h${barWidth - 8} a4,4 0 0 1 4,4 V${baseline} Z`}
                        fill="var(--realm-accent-brass)"
                        fillOpacity={active ? 1 : 0.8}
                      />
                    ) : null}
                    <rect
                      x={plotLeft + index * slot}
                      y={CHART_MARGIN.top}
                      width={slot}
                      height={baseline - CHART_MARGIN.top}
                      fill="transparent"
                      onPointerEnter={() => setHover(index)}
                    />
                  </g>
                );
              })}
            </svg>
            {hovered ? (
              <ChartTooltip x={xScale(hover!)} y={yScale(hovered.count)} width={width}>
                <p className="font-semibold text-foreground">
                  {hovered.count} listing{hovered.count === 1 ? "" : "s"}
                </p>
                <p className="text-muted-foreground">{range(hovered)}</p>
              </ChartTooltip>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
