import { mapConcurrent } from "./concurrency.mjs";
import { address, ApiError } from "./domain.mjs";
import { decodeEvent } from "./decode.mjs";
const equal = (a, b) => BigInt(a) === BigInt(b);
const signature = (e) =>
  JSON.stringify([
    address(e.from_address),
    e.keys.map((x) => BigInt(x).toString()),
    e.data.map((x) => BigInt(x).toString()),
  ]);
export async function scanOnce(store, rpc, config, options = {}) {
  try {
    return await scanRange(store, rpc, config, options);
  } catch (error) {
    store.put("status", "rpc", {
      ...store.get("status", "rpc"),
      error: error.code ?? "INDEXER_ERROR",
      identityVerified: false,
    });
    throw error;
  }
}
async function scanRange(store, rpc, config, { window = 100, stopAt } = {}) {
  if (!Number.isSafeInteger(window) || window < 1 || window > 1000)
    throw new ApiError("INVALID_WINDOW", "Scan window must be 1–1000 blocks.");
  const identity = {
    chainId: "0x" + BigInt(config.chainId).toString(16),
    marketplace: config.marketplace ? address(config.marketplace) : null,
  };
  const saved = store.db
    .prepare("SELECT value FROM meta WHERE key='identity'")
    .get();
  if (
    saved &&
    JSON.stringify(JSON.parse(saved.value)) !== JSON.stringify(identity)
  )
    throw new ApiError(
      "DATABASE_IDENTITY_MISMATCH",
      "Use a separate chain database for each chain and deployment.",
      409,
    );
  store.db
    .prepare("INSERT OR IGNORE INTO meta VALUES('identity',?)")
    .run(JSON.stringify(identity));

  if (!equal(await rpc.call("starknet_chainId", []), config.chainId))
    throw new ApiError("CHAIN_MISMATCH", "RPC is on another chain.");
  const latest = await rpc.call("starknet_getBlockWithTxHashes", {
    block_id: "latest",
  });
  if (!["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(latest.status))
    throw new ApiError("UNACCEPTED_HEAD", "RPC head is not accepted.");
  const observedAt = Date.now();
  if (config.marketplaceClassHash && config.marketplace) {
    const hash = await rpc.call("starknet_getClassHashAt", {
      block_id: { block_hash: latest.block_hash },
      contract_address: config.marketplace,
    });
    if (!equal(hash, config.marketplaceClassHash))
      throw new ApiError(
        "CLASS_MISMATCH",
        "Marketplace code identity changed.",
      );
  }
  let head = store.head();
  while (head) {
    const canonical = await rpc.call("starknet_getBlockWithTxHashes", {
      block_id: { block_number: head.number },
    });
    if (equal(canonical.block_hash, head.hash)) break;
    store.rewind(head.number - 1);
    head = store.head();
  }
  const sources = [
    ...config.collections.map((c) => ({
      address: address(c.address),
      start: c.startBlock,
    })),
    ...(config.marketplace
      ? [
          {
            address: address(config.marketplace),
            start: config.marketplaceStartBlock,
          },
        ]
      : []),
  ];
  if (
    !sources.length ||
    sources.some((s) => !Number.isSafeInteger(s.start) || s.start < 0)
  )
    throw new ApiError(
      "INVALID_REGISTRY",
      "Verified source start blocks are required.",
    );
  for (const source of sources) {
    const progress = store.get("progress", source.address);
    if (
      head &&
      source.start <= head.number &&
      (!progress ||
        !Number.isSafeInteger(progress.startBlock) ||
        progress.startBlock > source.start ||
        progress.block !== head.number ||
        !equal(progress.hash, head.hash))
    )
      throw new ApiError(
        "SOURCE_BACKFILL_REQUIRED",
        `Source ${source.address} has incomplete historical coverage. Rebuild the chain database with the complete registry before publishing it.`,
        409,
      );
  }
  const from = head
    ? head.number + 1
    : Math.min(...sources.map((s) => s.start));
  const end = Math.min(
    latest.block_number,
    from + window - 1,
    stopAt ?? Infinity,
  );
  store.put("status", "rpc", {
    head: latest.block_number,
    hash: latest.block_hash,
    observedAt,
    identityVerified: !!config.marketplaceClassHash,
    error: null,
  });
  if (from > end) {
    store.reconcileNotifications();
    return { indexed: store.head()?.number ?? null, head: latest.block_number };
  }
  const anchor = await rpc.call("starknet_getBlockWithTxHashes", {
    block_id: { block_number: end },
  });
  const found = new Map();
  for (const source of sources) {
    if (source.start > end) continue;
    const start = Math.max(from, source.start);
    let cursor;
    const cursors = new Set();
    do {
      const page = await rpc.call(
        "starknet_getEvents",
        {
          filter: {
            from_block: { block_number: start },
            to_block: { block_number: end },
            address: source.address,
            keys: [],
            chunk_size: 500,
            ...(cursor ? { continuation_token: cursor } : {}),
          },
        },
        { endpoint: rpc.urls?.[0] },
      );
      if (!Array.isArray(page.events))
        throw new ApiError("INVALID_RPC_EVENTS", "Invalid event page.");
      for (const e of page.events) {
        if (
          e.block_number < start ||
          e.block_number > end ||
          address(e.from_address) !== source.address
        )
          throw new ApiError("INVALID_RPC_EVENTS", "Out-of-scope RPC event.");
        const entries = found.get(e.block_number) ?? [];
        entries.push(e);
        found.set(e.block_number, entries);
      }
      cursor = page.continuation_token;
      if (cursor) {
        if (cursors.has(cursor))
          throw new ApiError("RPC_CURSOR_LOOP", "RPC repeated its cursor.");
        cursors.add(cursor);
      }
    } while (cursor);
  }
  const anchorCheck = await rpc.call("starknet_getBlockWithTxHashes", {
    block_id: { block_number: end },
  });
  if (!equal(anchor.block_hash, anchorCheck.block_hash))
    throw new ApiError(
      "CHAIN_CONFLICT",
      "Scan range changed during acquisition.",
    );
  const blocks = await mapConcurrent(
    Array.from({ length: end - from + 1 }, (_, i) => from + i),
    8,
    async (n) => {
      // A filtered page can silently omit every event in a block. Sampling empty
      // blocks cannot prove coverage; compare every block with its full receipts.
      const block = await rpc.call(
        "starknet_getBlockWithReceipts",
        { block_id: { block_number: n } },
      );
      if (block.block_number !== n ||
          !["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(block.status) ||
          !Array.isArray(block.transactions))
        throw new ApiError("INVALID_RPC_BLOCK", "Expected an accepted receipt block at the requested height.");
      return { n, block };
    },
  );
  if (!equal(blocks.at(-1).block.block_hash, anchor.block_hash))
    throw new ApiError(
      "CHAIN_CONFLICT",
      "Range changed while reading receipts.",
    );
  for (const { n, block: b } of blocks) {
    const expected = found.get(n) ?? [];
    const active = new Set(
      sources.filter((s) => s.start <= n).map((s) => s.address),
    );
    const events = [],
      actual = [];
    for (const entry of b.transactions) {
      const receipt = entry.receipt;
      if (!receipt || !Array.isArray(receipt.events))
        throw new ApiError(
          "INVALID_RECEIPT",
          "Missing ordered receipt events.",
        );
      const rawTransactionHash = receipt.transaction_hash ?? entry.transaction?.transaction_hash;
      const transactionHash = rawTransactionHash ? "0x"+BigInt(rawTransactionHash).toString(16) : null;
      if (!transactionHash)
        throw new ApiError(
          "INVALID_RECEIPT",
          "Receipt transaction identity missing.",
        );
      if (
        receipt.transaction_hash &&
        entry.transaction?.transaction_hash &&
        !equal(receipt.transaction_hash, entry.transaction.transaction_hash)
      )
        throw new ApiError(
          "INVALID_RECEIPT",
          "Conflicting transaction identity.",
        );
      if (receipt.execution_status === "REVERTED") continue;
      for (const [eventIndex, raw] of receipt.events.entries()) {
        if (!active.has(address(raw.from_address))) continue;
        actual.push({ raw, tx: transactionHash });
        const event = decodeEvent(raw, config);
        if (event)
          events.push({ ...event, raw, transactionHash, eventIndex });
      }
    }
    const a = actual.map((x) => `${BigInt(x.tx)}:${signature(x.raw)}`).sort(),
      e = expected
        .map((x) => `${BigInt(x.transaction_hash)}:${signature(x)}`)
        .sort();
    if (
      JSON.stringify(a) !== JSON.stringify(e) ||
      expected.some((e) => !equal(e.block_hash, b.block_hash))
    )
      throw new ApiError(
        "EVENT_COVERAGE",
        "Filtered events do not match full receipts.",
      );
    store.applyBlock({
      number: n,
      hash: b.block_hash,
      parentHash: b.parent_hash,
      timestamp: b.timestamp,
      events,
      sources: [...active],
      sourceStarts: Object.fromEntries(sources.map(s => [s.address, s.start])),
      observedAt,
    });
  }
  return { indexed: end, head: latest.block_number };
}
