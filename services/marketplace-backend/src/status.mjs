import { address } from "./domain.mjs";
export function marketStatus(
  config,
  { head, rpc, cfg, progress, generation, history },
) {
  const required = [
    ...(config.collections ?? []).map((c) => address(c.address)),
    ...(config.marketplace ? [address(config.marketplace)] : []),
  ];
  const starts = new Map([
    ...(config.collections ?? []).map((c) => [
      address(c.address),
      c.startBlock,
    ]),
    ...(config.marketplace
      ? [[address(config.marketplace), config.marketplaceStartBlock]]
      : []),
  ]);
  const incompleteHistory = required.some((source, i) => {
    const start = starts.get(source),
      p = progress[i];
    return (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(p?.startBlock) ||
      p.startBlock > start
    );
  });
  const missing = progress.some((p) => !p);
  const indexed = missing ? null : Math.min(...progress.map((p) => p.block));
  const lag = indexed == null || !rpc ? null : Math.max(0, rpc.head - indexed);
  const reasons = [];
  if (history && history.state !== "passed")
    reasons.push("HISTORY_RECONCILIATION_REQUIRED");
  if (config.demo) reasons.push("DEMO");
  if (!config.marketplace || !cfg) reasons.push("MARKETPLACE_NOT_DEPLOYED");
  if (missing) reasons.push("SOURCES_SYNCING");
  if (incompleteHistory) reasons.push("SOURCE_BACKFILL_REQUIRED");
  if (!rpc || Date.now() - rpc.observedAt > 15000) reasons.push("HEAD_STALE");
  if (lag == null || lag > 2) reasons.push("INDEX_STALE");
  if (!rpc?.identityVerified) reasons.push("IDENTITY_UNVERIFIED");
  if (cfg?.paused) reasons.push("PAUSED");
  if (rpc?.error) reasons.push("RPC_ERROR");
  return {
    chain: config.chain,
    marketplace: config.marketplace,
    indexedBlock: head?.number ?? null,
    chainHead: rpc?.head ?? null,
    lagBlocks: lag,
    observedAt: rpc?.observedAt ?? null,
    generation: generation,
    sources: progress,
    ...(history ? { history } : {}),
    safeForCheckout: !reasons.length,
    reasons,
  };
}
