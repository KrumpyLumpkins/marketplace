"use client";

import { startTransition, useCallback, useEffect, useMemo, useReducer } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SeedCollection } from "@/lib/marketplace/config";
import { CollectionRouteView } from "@/features/collections/collection-route-view";
import {
  type ActiveFilters,
} from "@/lib/marketplace/traits";
import {
  collectionDiscoveryStateFromSearchParams,
  collectionDiscoveryStateToSearchParams,
  type CollectionDiscoveryState,
} from "@/features/collections/collection-query-params";

type CollectionRouteContainerProps = {
  address: string;
  cursor?: string | null;
  collections?: SeedCollection[];
};

function cloneActiveFilters(activeFilters: ActiveFilters): ActiveFilters {
  return Object.fromEntries(
    Object.entries(activeFilters).map(([traitName, values]) => [
      traitName,
      new Set(values),
    ]),
  );
}

function cloneDiscoveryState(state: CollectionDiscoveryState): CollectionDiscoveryState {
  return {
    ...state,
    activeFilters: cloneActiveFilters(state.activeFilters),
  };
}

type OptimisticDiscoveryState = {
  searchParamsKey: string;
  state: CollectionDiscoveryState;
};

type OptimisticDiscoveryAction =
  | { type: "SYNC_FROM_URL"; searchParamsKey: string; state: CollectionDiscoveryState }
  | { type: "APPLY"; state: CollectionDiscoveryState };

function optimisticDiscoveryReducer(
  currentState: OptimisticDiscoveryState,
  action: OptimisticDiscoveryAction,
): OptimisticDiscoveryState {
  switch (action.type) {
    case "SYNC_FROM_URL":
      if (currentState.searchParamsKey === action.searchParamsKey) {
        return currentState;
      }

      return {
        searchParamsKey: action.searchParamsKey,
        state: cloneDiscoveryState(action.state),
      };
    case "APPLY":
      return {
        ...currentState,
        state: cloneDiscoveryState(action.state),
      };
  }
}

export function CollectionRouteContainer({
  address,
  cursor,
  collections,
}: CollectionRouteContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const discoveryState = useMemo(
    () =>
      collectionDiscoveryStateFromSearchParams(
        new URLSearchParams(searchParamsKey),
      ),
    [searchParamsKey],
  );
  const [optimisticDiscoveryState, dispatchOptimisticDiscoveryState] = useReducer(
    optimisticDiscoveryReducer,
    {
      searchParamsKey,
      state: cloneDiscoveryState(discoveryState),
    },
  );

  useEffect(() => {
    dispatchOptimisticDiscoveryState({
      type: "SYNC_FROM_URL",
      searchParamsKey,
      state: discoveryState,
    });
  }, [discoveryState, searchParamsKey]);

  const current = optimisticDiscoveryState.state;

  const applyDiscoveryState = useCallback((nextState: CollectionDiscoveryState) => {
    const clonedState = cloneDiscoveryState(nextState);
    const nextParams = collectionDiscoveryStateToSearchParams(
      new URLSearchParams(searchParamsKey),
      clonedState,
    );
    const queryString = nextParams.toString();

    dispatchOptimisticDiscoveryState({ type: "APPLY", state: clonedState });
    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParamsKey]);

  const update = useCallback(
    (patch: Partial<CollectionDiscoveryState>) => {
      applyDiscoveryState({ ...current, ...patch });
    },
    [applyDiscoveryState, current],
  );

  return (
    <CollectionRouteView
      activeFilters={current.activeFilters}
      address={address}
      cursor={cursor}
      collections={collections}
      listedOnly={current.listedOnly}
      onActiveFiltersChange={(activeFilters) => update({ activeFilters })}
      onListedOnlyChange={(listedOnly) => update({ listedOnly })}
      onQueryChange={(query) => update({ query })}
      onSortModeChange={(sortMode) => update({ sortMode })}
      onTabChange={(tab) => update({ tab })}
      query={current.query}
      sortMode={current.sortMode}
      tab={current.tab}
    />
  );
}
