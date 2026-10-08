import type { MarketConfig } from "@/lib/marketplace/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
const reasons: Record<string, string> = {
  HEAD_STALE: "The latest network block has not been confirmed yet.",
  INDEX_STALE: "Marketplace data is being updated. Please check again shortly.",
  IDENTITY_UNVERIFIED: "The marketplace deployment is awaiting verification.",
  PAUSED: "Trading has been paused. Existing orders remain visible.",
  INDEX_BEHIND: "Marketplace data is catching up with the network.",
};
export function MarketStatus({
  config,
  loading = false,
  error = false,
  onRefresh,
}: {
  config?: MarketConfig;
  loading?: boolean;
  error?: boolean;
  onRefresh: () => void;
}) {
  const status = config?.status;
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Market status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status" className="font-medium">
          {loading
            ? "Checking market status…"
            : error
              ? "Status unavailable"
              : config?.demo
                ? "Demo marketplace"
                : status?.safeForCheckout
                  ? "Ready for trading"
                  : "Trading temporarily unavailable"}
        </p>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Checking network and indexer freshness."
            : error
            ? "We could not check the marketplace. Refresh to try again."
            : config?.demo
              ? "Browse sample NFTs and try the cart. Purchases and offers are disabled in this demo."
              : status?.safeForCheckout
                ? "Marketplace data is up to date. You can browse and trade."
                : "You can browse indexed items. Trading will resume when the marketplace is ready."}
        </p>
        {!config?.demo && !loading && !error && !status?.safeForCheckout && (
          <ul className="space-y-2 text-sm">
            {[
              ...new Set(
                status?.reasons.map(
                  (r) =>
                    reasons[r] ??
                    "The service is not ready for trading yet. Please check again shortly.",
                ),
              ),
            ].map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {config && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Network</dt>
            <dd>
              {config.chain === "SN_MAIN"
                ? "Starknet mainnet"
                : config.chain === "SN_SEPOLIA"
                  ? "Starknet Sepolia"
                  : config.chain}
            </dd>
            <dt>Indexed block</dt>
            <dd>{status?.indexedBlock ?? "Awaiting update"}</dd>
            <dt>Blocks behind</dt>
            <dd>{status?.lagBlocks ?? "Awaiting update"}</dd>
          </dl>
        )}
        <Button variant="outline" disabled={loading} onClick={onRefresh}>
          Refresh status
        </Button>
      </CardContent>
    </Card>
  );
}
