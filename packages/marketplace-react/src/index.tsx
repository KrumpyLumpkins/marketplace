"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  QueryClientProvider,
  useQuery,
  useInfiniteQuery,
  useMutation,
} from "@tanstack/react-query";
import type {
  MarketplaceClient,
  Query,
  PreparedTrade,
  AccountAdapter,
  PendingStorage,
  ApiPage,
} from "@biblio/marketplace";
const Context = createContext<MarketplaceClient | null>(null);
export function MarketplaceProvider({
  client,
  children,
}: {
  client: MarketplaceClient;
  children: ReactNode;
}) {
  return (
    <Context.Provider value={client}>
      <QueryClientProvider client={client.queryClient}>
        {children}
      </QueryClientProvider>
    </Context.Provider>
  );
}
export function useMarketplace() {
  const client = useContext(Context);
  if (!client) throw new Error("Wrap this application in MarketplaceProvider.");
  return client;
}
export function useMarketplaceQuery<T>(
  path: string,
  params: Query = {},
  options: {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
  } = {},
) {
  const client = useMarketplace();
  return useQuery({ ...client.queryOptions<T>(path, params), ...options });
}
export function useMarketplacePages<T>(
  path: string,
  params: Query = {},
  enabled = true,
) {
  const client = useMarketplace();
  return useInfiniteQuery({
    queryKey: client.queryKey(path, { ...params, pages: true }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.request<ApiPage<T>>(
        path,
        { ...params, cursor: pageParam },
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
    retry: false,
  });
}
export function useMarketplaceMutation<TInput, TResult>(path: string) {
  const client = useMarketplace();
  return useMutation({
    mutationKey: client.queryKey(path),
    mutationFn: (input: TInput) => client.request<TResult>(path, {}, input),
    retry: false,
    onSuccess: () =>
      client.queryClient.invalidateQueries({
        queryKey: client.queryKey("").slice(0, -2),
      }),
  });
}
export function useTradeState() {
  const client = useMarketplace();
  return useSyncExternalStore(
    client.transactions.subscribe,
    client.transactions.getSnapshot,
    client.transactions.getSnapshot,
  );
}
export function useSubmitTrade(
  account: AccountAdapter,
  storage?: PendingStorage,
) {
  const client = useMarketplace();
  return useMutation({
    mutationFn: (plan: PreparedTrade) =>
      client.trades.submit(plan, account, storage),
    retry: false,
  });
}

/** App-specific read models can retain their selectors while sharing deployment-scoped query keys. */
export function useClientQuery<T>(
  client: MarketplaceClient,
  options: import("@tanstack/react-query").UseQueryOptions<T>,
) {
  return useQuery({
    ...options,
    queryKey: client.queryKey("/resources", { key: options.queryKey }),
  });
}
export function useTransactionState(
  coordinator: MarketplaceClient["transactions"],
) {
  return useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
}

export type ContractHookOptions =
  import("@biblio/marketplace").ContractReadOptions & {
    enabled?: boolean;
    staleTime?: number;
    refetchInterval?: number;
  };
export function useContractConfig(options: ContractHookOptions = {}) {
  const client = useMarketplace();
  return useQuery({ ...client.contract.configQuery(options), ...options });
}
export function useContractOrder(
  key: import("@biblio/marketplace").OrderKey,
  options: ContractHookOptions = {},
) {
  const client = useMarketplace();
  return useQuery({ ...client.contract.orderQuery(key, options), ...options });
}
export function useContractQuote(
  collection: string,
  tokenId: string,
  buyerDebit: string,
  options: ContractHookOptions = {},
) {
  const client = useMarketplace();
  return useQuery({
    ...client.contract.quoteQuery(collection, tokenId, buyerDebit, options),
    ...options,
  });
}
export function useSubmitAdmin(
  account: AccountAdapter,
  storage?: PendingStorage,
) {
  const client = useMarketplace();
  return useMutation({
    mutationFn: (plan: import("@biblio/marketplace").PreparedAdminAction) =>
      client.contract.admin.submit(plan, account, storage),
    retry: false,
  });
}
