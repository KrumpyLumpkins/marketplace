import { queryOptions } from "@tanstack/react-query";
import {
  aggregateTraitSummaryPages,
  type TraitNameSummary,
} from "@/lib/marketplace/traits";

export const TRAIT_SUMMARY_STALE_TIME_MS = 60_000;

export type TraitNamesSummaryQueryInput = {
  address: string;
  projectId?: string;
};

export function traitNamesSummaryQueryKey(options: TraitNamesSummaryQueryInput) {
  return ["trait-names-summary", options.address, options.projectId] as const;
}

export async function fetchTraitNamesSummaryAggregate(
  options: TraitNamesSummaryQueryInput,
): Promise<TraitNameSummary[]> {
  const { fetchTraitNamesSummary } = await import("@/lib/marketplace/api-client");
  const result = await fetchTraitNamesSummary({
    address: options.address,
    defaultProjectId: options.projectId,
  });

  return aggregateTraitSummaryPages(result.pages);
}

export function traitNamesSummaryQueryOptions(options: TraitNamesSummaryQueryInput) {
  return queryOptions({
    queryKey: traitNamesSummaryQueryKey(options),
    queryFn: () => fetchTraitNamesSummaryAggregate(options),
    staleTime: TRAIT_SUMMARY_STALE_TIME_MS,
  });
}
