import { getTokenIconUrl, getTokenSymbol } from "@/lib/marketplace/token-display";
import { cn } from "@/lib/utils";

type TokenSymbolProps = {
  address: string;
  showIcon?: boolean;
  className?: string;
};

export function TokenSymbol({ address, showIcon = true, className }: TokenSymbolProps) {
  const symbol = getTokenSymbol(address);
  const iconUrl = showIcon ? getTokenIconUrl(address) : null;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          aria-hidden
          className="size-3.5 rounded-full bg-[color:var(--realm-surface-slate)] object-cover ring-1 ring-[color:var(--realm-border-etched)]"
          src={iconUrl}
        />
      ) : null}
      <span>{symbol}</span>
    </span>
  );
}
