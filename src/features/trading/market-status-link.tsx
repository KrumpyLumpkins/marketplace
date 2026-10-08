"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTrade } from "@/lib/marketplace/use-trade";

const subscribeNoop = () => () => {};

/** Labelled status entry: details and block height live on the status page. */
export function MarketStatusLink({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { config, configError } = useTrade();
  // Server markup and the first client paint must agree; the live state arrives after hydration.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const label = !hydrated
    ? "Checking market"
    : configError
      ? "Market data unavailable"
      : !config
        ? "Checking market"
        : config.demo
          ? "Demo mode"
          : config.status.safeForCheckout
            ? "Market operational"
            : "Trading unavailable";
  const healthy =
    hydrated && !!config?.status.safeForCheckout && !config.demo && !configError;
  return (
    <Link
      href="/ops"
      onClick={onNavigate}
      aria-label={`Market status: ${label}`}
      title={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${healthy ? "bg-emerald-400" : "bg-amber-400"}`}
      />
      {!compact && label}
    </Link>
  );
}
