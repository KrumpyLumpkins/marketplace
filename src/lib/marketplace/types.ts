import type { ApiOrder } from "@biblio/marketplace";
export type {ApiToken,ApiOrder,ApiCollection,ApiPage,IndexStatus,MarketConfig} from "@biblio/marketplace";
export type NormalizedToken = {
  contract_address: string;
  token_id: string;
  metadata: unknown;
  image?: string | null;
  total_supply?: string;
  owner?: string | null;
  best_listing?: MarketplaceOrder;
  [key: string]: unknown;
};
export type MarketplaceOrder = {
  id: string;
  maker: string;
  nonce: string;
  collection: string;
  tokenId: string | null;
  token_id: string | null;
  owner: string;
  currency: string;
  price: string;
  quantity: string;
  expiration: string;
  status: string;
  category: string;
  kind: ApiOrder["kind"];
  apiOrder: ApiOrder;
  createdAt?: unknown;
  updatedAt?: unknown;
};
export type CollectionSummaryOptions = {
  address: string;
  projectId?: string;
  fetchImages?: boolean;
};
export type FetchCollectionTokensOptions = {
  address: string;
  project?: string;
  cursor?: string | null;
  limit?: number;
  tokenIds?: string[];
  fetchImages?: boolean;
  attributeFilters?: Record<string, string[]>;
  filters?: Array<{
    name: string;
    values?: Array<string | number | boolean>;
    min?: number;
    max?: number;
  }>;
  sort?: string;
  currency?: string;
  /** Name substring or exact token id. */
  q?: string;
  /** Only tokens with a live listing in `currency`. */
  listedOnly?: boolean;
};
export type CollectionOrdersOptions = {
  collection: string;
  projectId?: string;
  tokenId?: string;
  limit?: number;
  cursor?: string;
  status?: "None" | "Placed" | "Canceled" | "Executed";
  category?: "None" | "Buy" | "Sell";
  currency?: string;
  verifyOwnership?: boolean;
  orderIds?: string[];
};
export type CollectionListingsOptions = CollectionOrdersOptions;
export type TokenDetailsOptions = {
  collection: string;
  tokenId: string;
  projectId?: string;
  fetchImages?: boolean;
};
export type TokenDetails = {
  token: NormalizedToken;
  listings: MarketplaceOrder[];
};
export type FetchTokenBalancesOptions = {
  project?: string;
  contractAddresses?: string[];
  accountAddresses?: string[];
  tokenIds?: string[];
  cursor?: string | null;
  limit?: number;
  defaultProjectId?: string;
};
export type FetchTokenBalancesResult = {
  page: {
    balances: Array<{
      contract_address: string;
      token_id: string;
      account_address: string;
      balance: string;
      token?: NormalizedToken;
    }>;
    nextCursor: string | null;
  } | null;
  error: null;
};
export type MarketplaceClientConfig = {
  chainId: string;
  defaultProject?: string;
  runtime?: "edge" | "dojo";
};
export type MarketplaceClientStatus = "ready" | "loading" | "error";
