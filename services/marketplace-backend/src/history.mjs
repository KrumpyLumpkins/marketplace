import { address, ApiError, fromU256, u256Felts } from "./domain.mjs";
import { SELECTORS } from "./decode.mjs";
import { mapConcurrent } from "./concurrency.mjs";
// Reviewed Realms ERC721Votes implementation: transfers move one voting unit per NFT.
// Its timestamp checkpoint supply includes undelegated tokens. No generic fallback.
export const REALMS_HISTORY_PROFILE = Object.freeze({
  address: address(
    "0x7ae27a31bb6526e3de9cf02f081f6ce0615ac12a6d7b85ee58b8ad7947a2809",
  ),
  classHash:
    "0x42731c2355af9d59eda314ea3cca49ea3cc85173b2ca3c35c6c9df1c087cc43",
  supplySelector:
    "0xd2e488264e384e3a8b9045fc5040cc57df6877dfd12db9b326e50500d6d090",
});
export function historyProfile(config) {
  const c = config.collections?.[0];
  if (
    config.chain !== "SN_MAIN" ||
    config.collections.length !== 1 ||
    address(c.address) !== REALMS_HISTORY_PROFILE.address ||
    BigInt(c.classHash ?? 0) !== BigInt(REALMS_HISTORY_PROFILE.classHash)
  )
    throw new ApiError(
      "HISTORY_PROFILE_REQUIRED",
      "Fast history requires the reviewed Realms mainnet profile",
      503,
    );
  return REALMS_HISTORY_PROFILE;
}
const accepted = (b) => ["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(b.status);
export async function chooseHistoryCutoff(rpc, config, latest, from) {
  historyProfile(config);
  if (!Number.isSafeInteger(config.marketplaceStartBlock))
    throw new Error("A marketplace deployment boundary is required");
  let h = Math.min(
    config.marketplaceStartBlock - 1,
    latest.block_number - 5000,
  );
  if (h < from) return null;
  for (let n = 0; n < 100 && h >= from; n++, h--) {
    const b = await rpc.call("starknet_getBlockWithTxHashes", {
        block_id: { block_number: h },
      }),
      next = await rpc.call("starknet_getBlockWithTxHashes", {
        block_id: { block_number: h + 1 },
      });
    if (
      !accepted(b) ||
      !accepted(next) ||
      BigInt(next.parent_hash) !== BigInt(b.block_hash)
    )
      throw new Error("Invalid history checkpoint boundary");
    if (next.timestamp > b.timestamp) return h;
  }
  throw new Error("Could not pin a timestamp-boundary history checkpoint");
}
/** Resumable, pinned live inventory/approval reconciliation before strict market scanning. */
export async function reconcileHistory(
  store,
  rpc,
  config,
  history,
  { limit = 100 } = {},
) {
  const profile = historyProfile(config),
    h = history.cutoff,
    head = await store.head();
  if (head?.number !== h)
    throw new ApiError(
      "HISTORY_RECONCILIATION_REQUIRED",
      "Reconciliation must run before advancing beyond its pinned checkpoint",
      503,
    );
  const block = await rpc.call("starknet_getBlockWithTxHashes", {
      block_id: { block_number: h },
    }),
    next = await rpc.call("starknet_getBlockWithTxHashes", {
      block_id: { block_number: h + 1 },
    });
  if (
    !accepted(block) ||
    !accepted(next) ||
    BigInt(block.block_hash) !== BigInt(head.hash) ||
    BigInt(next.parent_hash) !== BigInt(head.hash) ||
    next.timestamp <= block.timestamp
  )
    throw new ApiError(
      "CHAIN_CONFLICT",
      "History checkpoint changed or has an ambiguous supply timestamp",
      503,
    );
  const classHash = await rpc.call("starknet_getClassHashAt", {
    block_id: { block_hash: block.block_hash },
    contract_address: profile.address,
  });
  const proofClass = await rpc.call("starknet_getClassHashAt", {
    block_id: { block_hash: next.block_hash },
    contract_address: profile.address,
  });
  if (BigInt(proofClass) !== BigInt(profile.classHash))
    throw new ApiError(
      "CLASS_MISMATCH",
      "Realms supply proof class changed",
      503,
    );
  if (BigInt(classHash) !== BigInt(profile.classHash))
    throw new ApiError("CLASS_MISMATCH", "Realms history profile changed", 503);
  let state = {
    ...history,
    state: "reconciling",
    checkpointBlock: h,
    checkpointHash: head.hash,
  };
  if (
    history.checkpointHash &&
    BigInt(history.checkpointHash) !== BigInt(head.hash)
  )
    state = {
      mode: "event_ranges",
      state: "reconciling",
      cutoff: h,
      checkpointBlock: h,
      checkpointHash: head.hash,
    };
  const blockId = { block_hash: head.hash };
  try {
    const supply = await rpc.contract(
      profile.address,
      profile.supplySelector,
      [String(block.timestamp)],
      { block_hash: next.block_hash },
    );
    if (supply.length !== 2)
      throw new Error("Invalid Realms checkpoint supply");
    const total = fromU256(supply[0], supply[1]);
    const count = (
      await store.query(
        "SELECT count(*)::text AS count FROM market.tokens WHERE collection=$1 AND NOT burned",
        [profile.address],
      )
    ).rows[0].count;
    if (BigInt(total) !== BigInt(count))
      throw new ApiError(
        "HISTORY_SUPPLY_MISMATCH",
        "Indexed live inventory does not match on-chain NFT supply",
        503,
        { indexed: count, onchain: total },
      );
    state.supply = total;
    state.proofHash = next.block_hash;
    state.phase ??= "tokens";
    if (state.phase === "tokens") {
      const tokens = (
        await store.query(
          "SELECT id,body FROM market.tokens WHERE collection=$1 AND NOT burned AND token_id>$2::numeric ORDER BY token_id LIMIT $3",
          [profile.address, state.lastTokenId ?? "-1", limit],
        )
      ).rows;
      await mapConcurrent(tokens, 4, async ({ id, body }) => {
        const owner = await rpc.contract(
          profile.address,
          SELECTORS.owner_of,
          u256Felts(body.tokenId),
          blockId,
        );
        if (owner.length !== 1 || address(owner[0]) !== body.owner)
          throw new ApiError(
            "HISTORY_OWNER_MISMATCH",
            "Historical ownership reconciliation failed",
            503,
            { tokenId: body.tokenId },
          );
        const approval = await rpc.contract(
            profile.address,
            SELECTORS.get_approved,
            u256Felts(body.tokenId),
            blockId,
          ),
          indexed = await store.get("approval", id);
        if (
          approval.length !== 1 ||
          address(approval[0]) !== address(indexed?.spender ?? "0")
        )
          throw new ApiError(
            "HISTORY_APPROVAL_MISMATCH",
            "Historical approval reconciliation failed",
            503,
            { tokenId: body.tokenId },
          );
      });
      if (tokens.length) {
        state.lastTokenId = tokens.at(-1).body.tokenId;
        state.checkedTokens = (state.checkedTokens ?? 0) + tokens.length;
      }
      if (tokens.length < limit) state.phase = "operators";
    } else if (state.phase === "operators") {
      const pairs = (
        await store.query(
          "SELECT id,body FROM market.operator_approvals WHERE id>$1 ORDER BY id LIMIT $2",
          [state.lastOperatorId ?? "", limit],
        )
      ).rows;
      await mapConcurrent(pairs, 4, async ({ id, body }) => {
        const [collection, owner, operator] = id.split(":");
        const value = await rpc.contract(
          collection,
          SELECTORS.is_approved_for_all,
          [owner, operator],
          blockId,
        );
        if (
          value.length !== 1 ||
          ![0n, 1n].includes(BigInt(value[0])) ||
          (BigInt(value[0]) === 1n) !== body.approved
        )
          throw new ApiError(
            "HISTORY_OPERATOR_MISMATCH",
            "Historical operator reconciliation failed",
            503,
            { owner, operator },
          );
      });
      if (pairs.length) {
        state.lastOperatorId = pairs.at(-1).id;
        state.checkedOperators = (state.checkedOperators ?? 0) + pairs.length;
      }
      if (pairs.length < limit) {
        state.phase = "market_owners";
      }
    }
    if (state.phase === "market_owners") {
      // Include the marketplace operator for every live owner, even absent event pairs.
      const owners = (
        await store.query(
          "SELECT DISTINCT owner FROM market.tokens WHERE collection=$1 AND NOT burned AND owner>$2 ORDER BY owner LIMIT $3",
          [profile.address, state.lastOwner ?? "", limit],
        )
      ).rows;
      await mapConcurrent(owners, 4, async ({ owner }) => {
        const v = await rpc.contract(
            profile.address,
            SELECTORS.is_approved_for_all,
            [owner, config.marketplace],
            blockId,
          ),
          p = await store.get(
            "operator",
            `${profile.address}:${owner}:${address(config.marketplace)}`,
          );
        if (
          v.length !== 1 ||
          ![0n, 1n].includes(BigInt(v[0])) ||
          (BigInt(v[0]) === 1n) !== (p?.approved ?? false)
        )
          throw new ApiError(
            "HISTORY_OPERATOR_MISMATCH",
            "Marketplace operator reconciliation failed",
            503,
            { owner },
          );
      });
      if (owners.length) state.lastOwner = owners.at(-1).owner;
      if (owners.length < limit) {
        if (BigInt(state.checkedTokens ?? 0) !== BigInt(total))
          throw new Error("Incomplete owner reconciliation");
        const check = await rpc.call("starknet_getBlockWithTxHashes", {
          block_id: { block_number: h },
        });
        if (BigInt(check.block_hash) !== BigInt(head.hash))
          throw new ApiError(
            "CHAIN_CONFLICT",
            "History checkpoint changed during reconciliation",
            503,
          );
        state.state = "passed";
        state.completedAt = Date.now();
      }
    }
    state.error = null;
    state.failure = null;
    await store.put("status", "history", state);
    return {
      indexed: h,
      head: (await store.get("status", "rpc"))?.head ?? h,
      reconciling: state.state !== "passed",
      checkedTokens: state.checkedTokens ?? 0,
      historyState: state.state,
    };
  } catch (error) {
    await store.put("status", "history", {
      ...state,
      state: "failed",
      error: error.code ?? "HISTORY_RECONCILIATION_FAILED",
      failure: error.details ?? null,
    });
    throw error;
  }
}
