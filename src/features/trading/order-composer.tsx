"use client";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { useId, useState } from "react";
import { Clock3 } from "lucide-react";
import { OrderAmountInput } from "./order-amount-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTrade } from "@/lib/marketplace/use-trade";
import {
  prepareOrder,
  estimateSellerProceeds,
  parseAmount,
} from "@biblio/marketplace";

export function OrderComposer({
  collection,
  tokenIds,
  kind,
  replaceIds = [],
  assets: providedAssets,
}: {
  assets?: Array<{ collection: string; tokenId: string }>;
  collection: string;
  tokenIds?: string[];
  kind: "listing" | "token_offer" | "collection_offer";
  replaceIds?: string[];
}) {
  const trade = useTrade();
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [duration, setDuration] = useState("86400");
  const durationId = useId();
  const [priceTouched, setPriceTouched] = useState(false);
  // Realms-only launch: never silently authorize a creator royalty after hiding the cap.
  const maxRoyalty = "0";
  const currencies = trade.config?.currencies ?? [];
  const selected =
    currencies.find((c) => c.address === currency) ?? currencies[0];
  const assets =
    providedAssets ??
    (tokenIds ?? []).map((tokenId) => ({ collection, tokenId }));
  const count = kind === "collection_offer" ? 1 : assets.length;
  let priceError = "";
  let validPrice = false;
  if (selected && price) {
    try {
      parseAmount(price, selected.decimals);
      validPrice = true;
    } catch (error) {
      priceError =
        error instanceof Error
          ? error.message
          : "Enter a valid decimal amount.";
    }
  }
  let preview: string | null = null;
  try {
    if (selected && price) {
      preview = estimateSellerProceeds({
        price,
        decimals: selected.decimals,
        feeBps: trade.config?.feeBps ?? 0,
        maxRoyalty,
        count,
      });
    }
  } catch {
    /* Incomplete user input has no valid preview. */
  }
  async function submit() {
    await trade.execute(async (marketplace) => {
      if (!selected) throw new Error("Choose a currency.");
      return prepareOrder(
        {
          marketplace,
          chain: trade.config!.chain,
          account: trade.address!,
          feeBps: trade.config!.feeBps,
        },
        {
          kind,
          collection,
          assets,
          currency: selected,
          price,
          maxRoyalty,
          durationSeconds: Number(duration),
          replaceIds,
        },
      );
    });
  }
  const title =
    kind === "listing"
      ? replaceIds.length
        ? "Reprice selected"
        : "List for sale"
      : kind === "collection_offer"
        ? "Make collection offer"
        : "Make offer";
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        {kind === "collection_offer" && (
          <p className="text-xs text-muted-foreground">
            An offer for one NFT from this collection.
          </p>
        )}
        {count > 1 && (
          <p className="text-xs text-muted-foreground">
            {count} orders · the price applies to each NFT.
          </p>
        )}
      </div>
      <OrderAmountInput
        value={price}
        onChange={(value) => {
          setPrice(value);
          setPriceTouched(false);
        }}
        onBlur={() => setPriceTouched(true)}
        currency={selected?.address ?? ""}
        onCurrencyChange={setCurrency}
        currencies={currencies}
        disabled={trade.busy}
        error={priceTouched ? priceError : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
        <label htmlFor={durationId} className="flex items-center gap-2 text-sm">
          <Clock3 aria-hidden className="size-4 text-muted-foreground" />
          Duration
        </label>
        <Select
          value={duration}
          onValueChange={setDuration}
          disabled={trade.busy}
        >
          <SelectTrigger
            id={durationId}
            aria-label="Duration"
            className="h-11 min-h-11 w-36 border-0 bg-muted/30 shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              ["3600", "1 hour"],
              ["86400", "1 day"],
              ["604800", "7 days"],
              ["2592000", "30 days"],
            ].map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <dl className="space-y-3 rounded-xl bg-muted/20 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Marketplace fee</dt>
          <dd>{trade.config ? `${trade.config.feeBps / 100}%` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Creator royalty</dt>
          <dd>0%</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border/70 pt-3">
          <dt className="text-muted-foreground">
            {count > 1 ? "Total seller proceeds" : "Seller receives"}
          </dt>
          <dd
            data-testid="seller-proceeds"
            className="min-w-0 break-all font-semibold tabular-nums text-primary"
          >
            {preview && BigInt(preview) > 0n
              ? `${formatCurrencyAmount(preview, selected?.address, selected?.decimals)} ${selected?.symbol ?? ""}`
              : "—"}
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {kind === "listing"
          ? "Fees are deducted from the sale price."
          : "Offer funds stay in your wallet and aren’t reserved."}{" "}
        Network fees are separate.
      </p>
      {!trade.address ? (
        <WalletConnectButton className="h-12 w-full text-sm font-semibold">
          Connect wallet to trade
        </WalletConnectButton>
      ) : (
        <Button
          onClick={() => void submit()}
          disabled={
            trade.busy ||
            !trade.address ||
            !validPrice ||
            !count ||
            !!trade.config?.demo
          }
          className="h-12 w-full text-sm font-semibold"
        >
          {trade.busy
            ? "Processing…"
            : !trade.address
              ? "Connect wallet to trade"
              : title}
        </Button>
      )}
    </div>
  );
}
