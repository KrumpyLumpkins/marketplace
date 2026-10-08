"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketPrice } from "@/components/marketplace/market-price";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ApiOrder } from "@/lib/marketplace/types";
import { useTrade } from "@/lib/marketplace/use-trade";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import {
  previewOffer,
  prepareAcceptance,
  type Preflight as Quote,
} from "@biblio/marketplace";
export function AcceptOffer({
  order,
  tokenId,
}: {
  order: ApiOrder;
  tokenId: string;
}) {
  const trade = useTrade();
  const [open, setOpen] = useState(false);
  const handingOff = useRef(false);
  const scope = [
    order.id,
    tokenId,
    trade.address,
    trade.config?.chain,
    trade.config?.marketplace,
  ].join(":");
  const [review, setReview] = useState<{ scope: string; quote: Quote } | null>(
    null,
  );
  const quote = review?.scope === scope ? review.quote : null;
  const requestSequence = useRef(0);
  const [previewPending, setPreviewPending] = useState(false);
  const [error, setError] = useState("");
  async function preview() {
    const sequence = ++requestSequence.current;
    setReview(null);
    setPreviewPending(true);
    try {
      setError("");
      if (!trade.config?.marketplace)
        throw new Error("Market is not configured.");
      const result = await previewOffer(
        marketplaceRequest,
        {
          marketplace: trade.config.marketplace,
          chain: trade.config.chain,
          account: trade.address!,
        },
        order,
        tokenId,
      );
      if (sequence === requestSequence.current)
        setReview({ scope, quote: result });
    } catch (e) {
      if (sequence === requestSequence.current)
        setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      if (sequence === requestSequence.current) setPreviewPending(false);
    }
  }
  async function accept() {
    handingOff.current = true;
    setOpen(false);
    await trade.execute((m) => {
      if (!quote) throw new Error("Review the offer again.");
      return prepareAcceptance(
        { marketplace: m, chain: trade.config!.chain, account: trade.address! },
        order,
        tokenId,
        quote,
      );
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          requestSequence.current++;
          setPreviewPending(false);
          setReview(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 border-primary/30 hover:bg-primary/10"
          disabled={
            previewPending ||
            trade.busy ||
            !trade.address ||
            !!trade.config?.demo
          }
          onClick={() => void preview()}
        >
          Review offer
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-5 sm:p-6"
        onCloseAutoFocus={(event) => {
          if (handingOff.current) {
            event.preventDefault();
            handingOff.current = false;
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Review offer</DialogTitle>
          <DialogDescription>
            Review your proceeds for token #{tokenId} before confirming in your
            wallet.
          </DialogDescription>
        </DialogHeader>
        {previewPending ? (
          <div role="status" aria-label="Checking offer" className="space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <p className="text-sm text-muted-foreground">
              Checking funding, approvals and your proceeds…
            </p>
          </div>
        ) : quote ? (
          <>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">
                You receive at least
              </p>
              <p className="mt-1 break-all text-2xl font-semibold text-primary">
                <MarketPrice
                  amount={quote.rows[0].sellerProceeds}
                  currency={order.currency}
                />
              </p>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Offer amount</dt>
                <dd className="font-medium">
                  <MarketPrice
                    amount={order.buyerDebit}
                    currency={order.currency}
                  />
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Protocol fee</dt>
                <dd>
                  <MarketPrice
                    amount={quote.rows[0].protocolFee}
                    currency={order.currency}
                  />
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted-foreground">Royalty</dt>
                <dd>
                  <MarketPrice
                    amount={quote.rows[0].royaltyAmount}
                    currency={order.currency}
                  />
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Fees and royalties are deducted from the offer amount. Final
              funding and ownership checks happen on-chain.
            </p>
            <Button
              className="min-h-11 w-full"
              disabled={trade.busy}
              onClick={() => void accept()}
            >
              Confirm acceptance
            </Button>
          </>
        ) : error ? (
          <div className="space-y-4">
            <p role="alert" className="break-words text-sm text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => void preview()}
            >
              Check offer again
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => void preview()}>
            Review updated offer
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
