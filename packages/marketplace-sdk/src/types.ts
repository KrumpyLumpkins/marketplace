export type ChainProvenance = {
  timestamp: number;
  blockNumber?: number;
  blockHash?: string;
  transactionHash?: string;
  eventIndex?: number;
};
export type ApiToken = {
  id: string;
  collection: string;
  tokenId: string;
  owner: string;
  metadata: Record<string, unknown>;
  attributes: Array<{ name: string; value: string | number | boolean }>;
  image?: string | null;
  bestListing?: ApiOrder;
  listings?: ApiOrder[];
  metadataStatus?: string;
};
export type ApiOrder = {
  id: string;
  maker: string;
  nonce: string;
  kind: "listing" | "token_offer" | "collection_offer";
  state: "open" | "filled" | "cancelled";
  availability?: string;
  collection: string;
  tokenId: string | null;
  currency: string;
  buyerDebit: string;
  expiry: string;
  royaltyAmount: string;
  royaltyCap: string;
  royaltyRecipient: string;
  feeBps: number;
  createdAt?: ChainProvenance;
  updatedAt?: ChainProvenance;
};
export type ApiCollection = {
  address: string;
  name: string;
  description?: string;
  image?: string | null;
  verified?: boolean;
  tokenCount: string;
  listingCount: string;
  floorByCurrency: Array<{ currency: string; symbol: string; price: string }>;
};
export type ApiPage<T> = { items: T[]; nextCursor: string | null };
export type IndexStatus = {
  chain: string;
  marketplace: string | null;
  indexedBlock: number | null;
  chainHead: number | null;
  lagBlocks: number | null;
  observedAt: number | null;
  generation: number;
  safeForCheckout: boolean;
  reasons: string[];
  history?: {
    mode: "event_ranges";
    state:
      | "pending"
      | "reconciling"
      | "failed"
      | "passed"
      | "invalid_checkpoint";
    cutoff: number;
    lastRangeEnd?: number;
    checkpointBlock?: number;
    checkpointHash?: string;
    checkedTokens?: number;
    checkedOperators?: number;
    supply?: string;
    completedAt?: number;
    error?: string | null;
  };
};
export type MarketConfig = {
  chain: string;
  chainId: string;
  marketplace: string | null;
  feeBps: number;
  feeRecipient: string;
  paused: boolean;
  demo: boolean;
  currencies: Array<{ address: string; symbol: string; decimals: number }>;
  collections: Array<{
    address: string;
    name: string;
    royaltyBps?: number;
    enabled?: boolean;
  }>;
  status: IndexStatus;
};
