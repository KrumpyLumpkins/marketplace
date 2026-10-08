/** HTTP concurrency counts batches, not individual block lookups within them. */
export function indexerOptions(env = process.env) {
  const read = (name, fallback, maximum) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > maximum)
      throw new Error(`${name} must be an integer from 1 to ${maximum}`);
    return value;
  };
  return {
    fastHistory: env.MARKETPLACE_INDEX_FAST_HISTORY === "true",
    historyWindow: read("MARKETPLACE_INDEX_HISTORY_WINDOW", 100000, 100000),
    window: read("MARKETPLACE_INDEX_WINDOW", 1000, 1000),
    receiptConcurrency: read("MARKETPLACE_INDEX_CONCURRENCY", 8, 32),
    receiptBatchSize: read("MARKETPLACE_INDEX_RPC_BATCH", 1, 32),
    commitBatchSize: read("MARKETPLACE_INDEX_COMMIT_BATCH", 250, 1000),
  };
}
