"use client";
import { useRef, type ReactNode, type RefObject } from "react";
import {
  Check,
  CheckCheck,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildExplorerTxUrl } from "@/lib/marketplace/token-display";
import type { TradeState } from "@/lib/marketplace/use-trade";
import { cn } from "@/lib/utils";
const titles: Record<TradeState["stage"], string> = {
  idle: "Transaction",
  checking: "Preparing your transaction",
  signature: "Confirm in your wallet",
  submitted: "Waiting for confirmation",
  accepted: "Confirmed on Starknet",
  indexing: "Updating the marketplace",
  reflected: "Transaction complete",
  reverted: "Transaction reverted",
  error: "Transaction needs attention",
};
export function TransactionDialog({
  open,
  state,
  busy,
  chain,
  onClose,
  onCheck,
  children,
  fallbackFocusRef,
}: {
  open: boolean;
  state: TradeState;
  busy: boolean;
  chain: string;
  onClose: () => void;
  onCheck: () => void;
  children?: ReactNode;
  fallbackFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const failed = state.stage === "error" || state.stage === "reverted";
  const complete = state.stage === "reflected";
  const confirmed = ["accepted", "indexing", "reflected"].includes(state.stage);
  const signed = !!state.hash;
  const steps = [
    { label: "Wallet approval", done: signed, current: !signed && !failed },
    {
      label: "Starknet confirmation",
      done: confirmed,
      current: signed && !confirmed && !failed,
    },
    {
      label: "Marketplace updated",
      done: complete,
      current: confirmed && !complete,
    },
  ];
  const Icon = failed
    ? CircleAlert
    : complete
      ? CheckCheck
      : state.stage === "signature"
        ? Wallet
        : LoaderCircle;
  const canCheck =
    !busy && !!state.hash && !complete && state.stage !== "reverted";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            returnFocus.current?.isConnected &&
            !returnFocus.current.hasAttribute("disabled")
              ? returnFocus.current
              : fallbackFocusRef?.current;
          target?.focus();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border-[color:var(--realm-border-etched)] p-5 shadow-2xl sm:p-7 motion-reduce:animate-none"
      >
        <DialogHeader className="items-center text-center sm:text-center">
          <div
            className={cn(
              "mb-3 grid size-14 place-items-center rounded-full border bg-primary/10 text-primary",
              failed &&
                "border-destructive/30 bg-destructive/10 text-destructive",
              complete &&
                "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                "size-6",
                Icon === LoaderCircle &&
                  busy &&
                  "animate-spin motion-reduce:animate-none",
              )}
            />
          </div>
          <DialogTitle className="text-xl leading-tight">
            {state.unknownSubmission
              ? "Check your wallet activity"
              : titles[state.stage]}
          </DialogTitle>
          <DialogDescription asChild>
            <p
              role={failed ? "alert" : "status"}
              aria-live={failed ? "assertive" : "polite"}
              className={cn(
                "max-w-sm break-words text-center text-sm leading-relaxed text-muted-foreground",
                failed && "text-destructive",
              )}
            >
              {state.message}
            </p>
          </DialogDescription>
        </DialogHeader>
        {!state.unknownSubmission && (
          <ol
            aria-label="Transaction progress"
            className="space-y-3 rounded-xl border bg-muted/30 p-4"
          >
            {steps.map((step, i) => (
              <li
                key={step.label}
                aria-current={step.current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-3 text-sm text-muted-foreground",
                  step.current && "text-foreground",
                  step.done && "text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums",
                    step.done && "border-primary/25 bg-primary/15 text-primary",
                    step.current && "border-primary text-primary",
                  )}
                  aria-hidden
                >
                  {step.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                {step.label}
                {step.current && busy && (
                  <LoaderCircle
                    aria-hidden
                    className="ml-auto size-3.5 animate-spin text-primary motion-reduce:animate-none"
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        {state.hash && (
          <a
            href={buildExplorerTxUrl(chain, state.hash)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View transaction"
            className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                View transaction
              </span>
              <span
                className="block truncate font-mono text-xs"
                title={state.hash}
              >
                {state.hash}
              </span>
            </span>
            <ExternalLink
              aria-hidden
              className="size-4 shrink-0 text-primary"
            />
          </a>
        )}
        {children}
        {busy ? (
          <p className="text-center text-xs text-muted-foreground">
            {state.stage === "signature"
              ? "Waiting for your wallet response."
              : "Please wait. Do not submit the same transaction again."}
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {canCheck && (
              <Button variant="outline" onClick={onCheck}>
                Check status
              </Button>
            )}
            <Button onClick={onClose}>{complete ? "Done" : "Close"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
