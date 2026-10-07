import type { ReactNode } from "react";

/** Page shell stays server-renderable; discovery belongs to the home/search routes. */
export function MarketplaceLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-[calc(100vh-4rem)] w-full min-w-0">{children}</div>;
}
