import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

describe("trait summary prefetch", () => {
  it("prefetches_summary_into_the_expected_query_cache_key", async () => {
    const mockFetchTraitNamesSummary = vi.fn().mockResolvedValue({
      pages: [
        {
          projectId: "project-a",
          traits: [
            { traitName: "Background", valueCount: 2 },
            { traitName: "Eyes", valueCount: 3 },
          ],
        },
      ],
      errors: [],
    });

    vi.doMock("@/lib/marketplace/api-client", () => ({
      fetchTraitNamesSummary: mockFetchTraitNamesSummary,
    }));

    const {
      traitNamesSummaryQueryKey,
    } = await import("@/lib/marketplace/trait-summary-query");
    const { prefetchTraitNamesSummary } = await import(
      "@/lib/marketplace/trait-summary-prefetch"
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    await prefetchTraitNamesSummary(queryClient, {
      address: "0xabc",
      projectId: "project-a",
    });

    expect(mockFetchTraitNamesSummary).toHaveBeenCalledWith({
      address: "0xabc",
      defaultProjectId: "project-a",
    });
    expect(
      queryClient.getQueryData(
        traitNamesSummaryQueryKey({ address: "0xabc", projectId: "project-a" }),
      ),
    ).toEqual([
      { traitName: "Background", valueCount: 2 },
      { traitName: "Eyes", valueCount: 3 },
    ]);
  });
});
