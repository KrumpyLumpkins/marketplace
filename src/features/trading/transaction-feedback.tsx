"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTrade, type TradeState } from "@/lib/marketplace/use-trade";
import { TransactionDialog } from "./transaction-dialog";
import { UnknownSubmission } from "./unknown-submission";
/** Mounted once by the toolbar. Closing the dialog never clears a saved transaction. */
export function TransactionFeedback() {
  const trade = useTrade();
  const trigger = useRef<HTMLButtonElement>(null);
  const [dismissed, setDismissed] = useState<TradeState | null>(null);
  const visible = trade.state.stage !== "idle" && trade.state !== dismissed;
  return (
    <>
      {trade.address && (
        <Button
          ref={trigger}
          size="sm"
          variant="ghost"
          className="min-h-9 w-44 shrink-0"
          onClick={() => {
            setDismissed(null);
            if (trade.state.stage === "idle") void trade.resume();
          }}
        >
          {" "}
          {trade.state.stage === "idle"
            ? "Check saved transaction"
            : "View transaction"}{" "}
        </Button>
      )}
      <TransactionDialog
        fallbackFocusRef={trigger}
        open={visible}
        state={trade.state}
        busy={trade.busy}
        chain={trade.config?.chain ?? "SN_MAIN"}
        onClose={() => setDismissed(trade.state)}
        onCheck={() => void trade.resume()}
      >
        {trade.address && trade.state.unknownSubmission && (
          <UnknownSubmission
            key={`${trade.address}:${trade.config?.marketplace}`}
            busy={trade.busy}
            onReconcile={trade.reconcileUnknown}
          />
        )}
      </TransactionDialog>
    </>
  );
}
