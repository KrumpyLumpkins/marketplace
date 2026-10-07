"use client";
import type { TradeState } from "@/lib/marketplace/use-trade";
export function TradeStatus({ state }: { state: TradeState }) {
  if (!state.message) return null;
  return (
    <div
      role={["error", "reverted"].includes(state.stage) ? "alert" : "status"}
      className={`break-words rounded-md border p-3 text-sm ${["error", "reverted"].includes(state.stage) ? "border-destructive text-destructive" : "text-muted-foreground"}`}
    >
      <p>{state.message}</p>
      {state.hash && (
        <p className="mt-1 font-mono text-xs">Transaction: {state.hash}</p>
      )}
    </div>
  );
}
