"use client";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
import { TradeStatus } from "./trade-status";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
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
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        disabled={
          previewPending || trade.busy || !trade.address || !!trade.config?.demo
        }
        onClick={() => void preview()}
      >
        {previewPending ? "Checking offer…" : "Review offer"}
      </Button>
      {quote && (
        <div className="rounded-md border p-3 text-sm">
          <p>
            You receive at least{" "}
            {formatCurrencyAmount(quote.rows[0].sellerProceeds, order.currency)}{" "}
            {getTokenSymbol(order.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            Protocol:{" "}
            {formatCurrencyAmount(quote.rows[0].protocolFee, order.currency)} ·
            royalty:{" "}
            {formatCurrencyAmount(quote.rows[0].royaltyAmount, order.currency)}
          </p>
          <Button
            className="mt-2"
            size="sm"
            disabled={trade.busy}
            onClick={() => void accept()}
          >
            Confirm acceptance
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <TradeStatus state={trade.state} />
    </div>
  );
}
