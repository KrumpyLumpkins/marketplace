import { type NormalizedToken } from "@/lib/marketplace/types";
import {
  formatNumberish,
  tokenImage,
  tokenName,
} from "@/lib/marketplace/token-display";
import { normalizeCollectionTokenId } from "@/lib/marketplace/token-id";
import type { CartItem } from "@/features/cart/store/cart-store";

export type CheapestListing = {
  orderId: string;
  tokenId: string;
  price: string;
  currency: string;
  quantity: string;
};

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function firstNumberish(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
) {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const key of keys) {
      const normalized = formatNumberish(source[key]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function firstString(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
) {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }

  return null;
}

function normalizeStatus(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return "placed";
    if (value === 2) return "canceled";
    if (value === 3) return "executed";
    if (value === 0) return "none";
    return null;
  }

  if (typeof value === "bigint") {
    if (value === BigInt(1)) return "placed";
    if (value === BigInt(2)) return "canceled";
    if (value === BigInt(3)) return "executed";
    if (value === BigInt(0)) return "none";
    return null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return normalizeStatus(record.value ?? record.status ?? record.state);
}

function firstStatus(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
) {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const key of keys) {
      const status = normalizeStatus(source[key]);
      if (status) {
        return status;
      }
    }
  }

  return null;
}

function comparePrice(left: string, right: string) {
  try {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue < rightValue ? -1 : 1;
  } catch {
    return 0;
  }
}

function normalizeListing(
  listing: unknown,
  nowEpochSeconds: bigint,
): CheapestListing | null {
  const fields = asRecord(listing);
  if (!fields) {
    return null;
  }

  const nestedOrder = asRecord(fields.order);
  const status = firstStatus([fields, nestedOrder], ["status", "state"]);
  if (status && status !== "placed") {
    return null;
  }
  const expiration = firstNumberish([fields, nestedOrder], [
    "expiration",
    "expiresAt",
    "expires_at",
  ]);
  if (expiration) {
    try {
      const expiry = BigInt(expiration);
      if (expiry > BigInt(0) && expiry <= nowEpochSeconds) {
        return null;
      }
    } catch {
      // Ignore malformed expiration values.
    }
  }

  const orderId = firstNumberish([fields, nestedOrder], [
    "id",
    "orderId",
    "order_id",
  ]);
  const tokenIdRaw = firstNumberish([fields, nestedOrder], ["tokenId", "token_id"]);
  const price = firstNumberish([fields, nestedOrder], [
    "price",
    "listingPrice",
    "listing_price",
  ]);
  const quantity =
    firstNumberish([fields, nestedOrder], ["quantity", "qty"]) ?? "1";
  const currency = firstString([fields, nestedOrder], ["currency"]);

  const tokenId = tokenIdRaw ? normalizeCollectionTokenId(tokenIdRaw) : null;

  if (!orderId || !tokenId || !price || !currency) {
    return null;
  }

  return {
    orderId,
    tokenId,
    price,
    currency,
    quantity,
  };
}

export function cheapestListingByTokenId(listings: unknown[] | undefined) {
  const entries = new Map<string, CheapestListing>();
  const nowEpochSeconds = BigInt(Math.floor(Date.now() / 1000));

  for (const listing of listings ?? []) {
    const normalized = normalizeListing(listing, nowEpochSeconds);
    if (!normalized) {
      continue;
    }

    const current = entries.get(normalized.tokenId);
    if (!current || comparePrice(normalized.price, current.price) < 0) {
      entries.set(normalized.tokenId, normalized);
    }
  }

  return entries;
}

export function cartItemFromTokenListing(
  token: NormalizedToken,
  collection: string,
  listing: CheapestListing,
  projectId?: string,
): CartItem {
  return {
    orderId: listing.orderId,
    collection,
    tokenId: listing.tokenId,
    price: listing.price,
    currency: listing.currency,
    quantity: listing.quantity,
    projectId,
    tokenName: tokenName(token),
    tokenImage: tokenImage(token),
  };
}
