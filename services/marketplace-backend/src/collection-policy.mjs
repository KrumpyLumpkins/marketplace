import { address, ApiError, u256Felts } from "./domain.mjs";
/** Only explicitly reviewed registry contracts opt into the token-lock interface. */
export async function checkTransferLock(
  rpc,
  config,
  collection,
  tokenId,
  blockId,
) {
  const policy = config.collections.find(
    (c) => address(c.address) === address(collection),
  );
  if (!policy?.transferLockSelector) return;
  const locked = await rpc.contract(
    collection,
    policy.transferLockSelector,
    u256Felts(tokenId),
    blockId,
  );
  if (locked.length !== 1 || ![0n, 1n].includes(BigInt(locked[0])))
    throw new ApiError(
      "LOCK_STATUS_UNAVAILABLE",
      "Unable to verify the NFT transfer lock.",
      503,
    );
  if (BigInt(locked[0]) === 1n)
    throw new ApiError(
      "TOKEN_LOCKED",
      "This NFT is locked by its collection. Unlock it before trading.",
      409,
    );
}
