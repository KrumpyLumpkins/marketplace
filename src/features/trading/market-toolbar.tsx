"use client";
import { useTrade } from "@/lib/marketplace/use-trade";
import { TransactionFeedback } from "./transaction-feedback";
import Link from "next/link";
/** One global feedback host. Healthy trading no longer needs a navigation band. */
export function MarketToolbar() {
  const trade = useTrade();
  const warning = trade.configError
    ? "Market data unavailable"
    : trade.config?.demo
      ? "Demo data · trading disabled"
      : trade.config && !trade.config.status.safeForCheckout
        ? "Trading unavailable"
        : null;
  return (
    <>
      {warning && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/20 bg-primary/5 px-4 py-2 text-sm"
        >
          <span>{warning}</span>
          <Link
            href="/ops"
            className="inline-flex min-h-8 items-center underline underline-offset-4"
          >
            View market status
          </Link>
        </div>
      )}
      <div className="fixed right-4 bottom-4 z-30 rounded-lg border border-border bg-background shadow-lg empty:hidden">
        <TransactionFeedback />
      </div>
    </>
  );
}
