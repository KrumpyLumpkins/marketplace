"use client";

import { useState } from "react";
import { Axes, CHART_MARGIN, ChartFrame, ChartTooltip } from "./chart-frame";
import { formatCompact, formatDayLabel, formatTimeLabel, linearScale, niceTicks, type SalesBucket } from "./chart-utils";

type VolumeChartProps = {
  buckets: SalesBucket[];
  bucketSeconds: number;
  symbol: string;
  loading?: boolean;
  refreshing?: boolean;
  summary?: React.ReactNode;
};

/** Traded volume per day (or per hour for one-day windows) as thin columns. */
export function VolumeChart({ buckets, bucketSeconds, symbol, loading, refreshing, summary }: VolumeChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const hourly = bucketSeconds < 86400;
  const hasVolume = buckets.some((bucket) => bucket.volume > 0);
  const label = (bucket: SalesBucket) =>
    hourly ? `${formatTimeLabel(bucket.day).replace(/^.*?, /, "")} UTC` : formatDayLabel(bucket.day, true);

  return (
    <ChartFrame
      title="Volume"
      subtitle={`Gross ${symbol} paid per ${hourly ? "hour" : "UTC day"}, including fees and royalties.`}
      summary={summary}
      loading={loading}
      refreshing={refreshing}
      empty={!hasVolume ? "No sales volume in this period." : null}
      table={
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">{hourly ? "Hour" : "Day"}</th>
              <th className="px-2 py-1 text-right font-medium">Sales</th>
              <th className="px-2 py-1 text-right font-medium">Volume ({symbol})</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.day} className="border-t border-[color:var(--realm-border-etched)]">
                <td className="px-2 py-1">{label(bucket)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{bucket.sales}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatCompact(bucket.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {(width, height) => {
        const max = Math.max(...buckets.map((b) => b.volume));
        const yTicks = niceTicks(0, max * 1.1);
        const yScale = linearScale([0, yTicks[yTicks.length - 1]], [height - CHART_MARGIN.bottom, CHART_MARGIN.top]);
        const plotLeft = CHART_MARGIN.left;
        const plotRight = width - CHART_MARGIN.right;
        const slot = (plotRight - plotLeft) / Math.max(buckets.length, 1);
        const barWidth = Math.min(24, Math.max(3, slot - 2));
        const baseline = height - CHART_MARGIN.bottom;
        const tickEvery = Math.max(1, Math.ceil(buckets.length / (width < 480 ? 3 : 6)));
        const xTickBuckets = buckets.filter((_, i) => i % tickEvery === 0);
        const xScale = (day: number) => {
          const index = buckets.findIndex((b) => b.day === day);
          return plotLeft + index * slot + slot / 2;
        };
        const hovered = hover !== null ? buckets[hover] : null;
        return (
          <>
            <svg
              role="img"
              aria-label={`Volume per ${hourly ? "hour" : "day"} in ${symbol}, peak ${formatCompact(max)}`}
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
                xTicks={xTickBuckets.map((b) => b.day)}
                xScale={xScale}
                formatY={formatCompact}
                formatX={(day) => (hourly ? formatTimeLabel(day).replace(/^.*?, /, "") : formatDayLabel(day))}
              />
              {buckets.map((bucket, index) => {
                const x = plotLeft + index * slot + (slot - barWidth) / 2;
                const y = yScale(bucket.volume);
                const h = Math.max(0, baseline - y);
                const active = hover === index;
                return (
                  <g key={bucket.day}>
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
              <ChartTooltip x={xScale(hovered.day)} y={yScale(hovered.volume)} width={width}>
                <p className="font-semibold text-foreground">
                  {formatCompact(hovered.volume)} {symbol}
                </p>
                <p className="text-muted-foreground">
                  {hovered.sales} sale{hovered.sales === 1 ? "" : "s"} · {label(hovered)}
                </p>
              </ChartTooltip>
            ) : null}
          </>
        );
      }}
    </ChartFrame>
  );
}
