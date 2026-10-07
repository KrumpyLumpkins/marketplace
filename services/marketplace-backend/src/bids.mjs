import { Catalog } from "./catalog.mjs";
import { preflight } from "./preflight.mjs";
import { ApiError, address, boundedInteger } from "./domain.mjs";
/** Descending gross price is an upper bound on net proceeds. Never label a truncated search complete. */
export async function bestBid(
  store,
  rpc,
  config,
  collection,
  tokenId,
  { currency, maxChecks = 50 } = {},
) {
  if (!currency)
    throw new ApiError(
      "CURRENCY_REQUIRED",
      "Choose a currency for bid comparison.",
    );
  const catalog = new Catalog(store, config),
    token = catalog.token(collection, tokenId);
  maxChecks = boundedInteger(maxChecks, 50, 50);
  const status = catalog.status();
  if (!status.safeForCheckout)
    throw new ApiError("INDEX_STALE", status.reasons.join(", "), 503);
  const deadline = Date.now() + 5000;
  let truncated = false;
  let cursor,
    best = null,
    checked = 0,
    complete = false;
  do {
    const page = catalog.orders(collection, {
      kind: "offer",
      state: "open",
      tokenMatch: tokenId,
      currency,
      limit: 50,
      cursor,
    });
    for (const order of page.items) {
      if (best && BigInt(order.buyerDebit) <= BigInt(best.sellerProceeds)) {
        complete = true;
        break;
      }
      if (checked >= maxChecks || Date.now() > deadline) {
        truncated = true;
        break;
      }
      if (order.maker === address(token.owner)) continue;
      checked++;
      const result = await preflight(store, rpc, config, {
        action: "accept",
        account: token.owner,
        items: [{ maker: order.maker, nonce: order.nonce, tokenId }],
      });
      if (result.canSubmit) {
        const row = result.rows[0];
        if (!best || BigInt(row.sellerProceeds) > BigInt(best.sellerProceeds))
          best = {
            order,
            ...row,
            checkedBlock: result.blockNumber,
            checkedHash: result.blockHash,
            expiresAt: result.expiresAt,
          };
      }
    }
    if (complete || truncated) break;
    cursor = page.nextCursor;
    if (!cursor) {
      complete = true;
      break;
    }
  } while (checked < maxChecks);
  return {
    best,
    checked,
    complete,
    currency: address(currency),
    label: complete ? "Best executable offer" : "Best checked offer",
    advisory: true,
  };
}
