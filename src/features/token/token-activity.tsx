import Link from "next/link";
import { MarketPrice } from "@/components/marketplace/market-price";
import { buildExplorerTxUrl } from "@/lib/marketplace/token-display";
export type TokenActivityItem = {
  id: string;
  type: string;
  kind?: string;
  buyerDebit?: string;
  currency?: string;
  buyer?: string;
  seller?: string;
  maker?: string;
  from?: string;
  to?: string;
  provenance: { timestamp: number; transactionHash?: string };
};
function Participant({ label, address }: { label: string; address?: string }) {
  if (!address) return null;
  return (
    <span className="flex flex-wrap gap-2">
      <span className="text-muted-foreground">{label}</span>
      {BigInt(address) === 0n ? (
        <span>Mint / burn</span>
      ) : (
        <Link
          className="text-primary underline underline-offset-4"
          href={`/profile/${address}`}
          title={address}
        >
          {address.length > 14
            ? `${address.slice(0, 6)}…${address.slice(-4)}`
            : address}
        </Link>
      )}
    </span>
  );
}
export function TokenActivity({
  items,
  chain,
}: {
  items: TokenActivityItem[];
  chain: string;
}) {
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li key={a.id} className="space-y-3 py-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>
              {a.type === "order_filled"
                ? "Sale"
                : a.type === "order_created"
                  ? a.kind === "listing"
                    ? "Listed"
                    : "Offer made"
                  : a.type === "order_cancelled"
                    ? "Order cancelled"
                    : a.type === "transfer"
                      ? "Transfer"
                      : a.type.replaceAll("_", " ")}
            </strong>
            {a.buyerDebit && (
              <MarketPrice amount={a.buyerDebit} currency={a.currency} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Participant label="Buyer" address={a.buyer} />
            <Participant label="Seller" address={a.seller} />
            <Participant label="Maker" address={a.maker} />
            <Participant label="From" address={a.from} />
            <Participant label="To" address={a.to} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <time
              dateTime={new Date(a.provenance.timestamp * 1000).toISOString()}
            >
              {new Date(a.provenance.timestamp * 1000).toLocaleString()}
            </time>
            {a.provenance.transactionHash &&
              ["SN_MAIN", "SN_SEPOLIA"].includes(chain) && (
                <a
                  className="text-primary underline underline-offset-4"
                  href={buildExplorerTxUrl(chain, a.provenance.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View transaction
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
          </div>
        </li>
      ))}
    </ul>
  );
}
