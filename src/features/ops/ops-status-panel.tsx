"use client";
import { useMarketConfig } from "@/lib/marketplace/react";
import { MarketStatus } from "./market-status";
export function OpsStatusPanel() {
  const query = useMarketConfig();
  return (
    <MarketStatus
      config={query.data}
      loading={query.isPending}
      error={query.isError}
      onRefresh={() => void query.refetch()}
    />
  );
}
