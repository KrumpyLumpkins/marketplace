/** Conservative per-NFT ceiling for a reviewed collection selection.
 * Mixed selections use the largest bound; actual token royalties are snapshotted
 * by settlement, so the UI must label proceeds as a minimum when nonzero.
 */
export function collectionRoyaltyLimit(
  registry: Array<{ address: string; royaltyBps?: number; enabled?: boolean }>,
  collections: string[],
): string {
  let maximum = 0;
  for (const collection of collections) {
    const terms = registry.find(
      (row) => BigInt(row.address) === BigInt(collection),
    );
    if (!terms)
      throw new Error("Collection royalty terms have not been reviewed.");
    if (terms.enabled === false)
      throw new Error("Trading is not enabled for this collection.");
    const bps = terms.royaltyBps ?? 0;
    if (!Number.isInteger(bps) || bps < 0 || bps >= 10000)
      throw new Error("Invalid collection royalty ceiling.");
    maximum = Math.max(maximum, bps);
  }
  return String(maximum / 100);
}
