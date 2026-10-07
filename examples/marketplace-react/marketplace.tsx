"use client";
import {
  MarketplaceProvider,
  useMarketplaceQuery,
} from "@biblio/marketplace-react";
import type { MarketplaceClient, ApiCollection } from "@biblio/marketplace";
function Collections() {
  const query = useMarketplaceQuery<ApiCollection[]>("/collections");
  return (
    <section className="space-y-3 rounded border p-4">
      <h2>Marketplace collections</h2>
      {query.isPending ? (
        <p>Loading collections…</p>
      ) : query.isError ? (
        <div>
          <p role="alert">{query.error.message}</p>
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <ul>
          {query.data.map((c) => (
            <li key={c.address}>{c.name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
export function MarketplaceExample({ client }: { client: MarketplaceClient }) {
  return (
    <MarketplaceProvider client={client}>
      <Collections />
    </MarketplaceProvider>
  );
}
