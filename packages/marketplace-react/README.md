# @biblio/marketplace-react

Optional React bindings for `@biblio/marketplace`, using TanStack React Query. React 19 and React Query 5 are peer dependencies. The package ships no styling, router or wallet chooser.

```tsx
import { MarketplaceProvider, useMarketplaceQuery } from '@biblio/marketplace-react';
import type { ApiCollection } from '@biblio/marketplace';

function Collections() {
  const query = useMarketplaceQuery<ApiCollection[]>('/collections');
  if (query.isPending) return <p>Loading…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  return <ul>{query.data.map(c => <li key={c.address}>{c.name}</li>)}</ul>;
}

// Construct the client once per mounted application; do not recreate it on every render.
export function App({ client }) {
  return <MarketplaceProvider client={client}><Collections /></MarketplaceProvider>;
}
```

`useMarketplacePages` provides cursor pagination. `useMarketplaceMutation` provides explicit API mutations without retries. `useTradeState` subscribes to the shared transaction coordinator; `useSubmitTrade` submits only when the caller invokes its mutate function. Prepare and review a plan through `useMarketplace().trades` before submitting. QueryClient is supplied by the marketplace client; nesting another provider is unnecessary.

`useClientQuery` and `useTransactionState` support the retained application's view-model adapters. They share the same public SDK and do not implement a parallel transaction workflow.

Supply wallet connection/signing and pending storage from the host. Multiple providers with separate clients are supported. For SSR, create a per-request client rather than sharing authenticated caches. See `examples/marketplace-react/marketplace.tsx` and the Integration/SDK consumer stories.

Direct-contract hooks are `useContractConfig`, `useContractOrder` and `useContractQuote`; configure `contractReader` on the supplied client first. `useSubmitAdmin` submits an explicitly reviewed plan from `client.contract.admin`. No governance action runs automatically on mount, and these hooks do not require an admin UI or wallet dependency in the package.

The direct-read hooks accept `enabled`, `staleTime` and `refetchInterval` alongside `blockId`. Use `enabled: false` while token/price form inputs are incomplete; validation runs inside the query function, so disabled queries do not throw during rendering.
