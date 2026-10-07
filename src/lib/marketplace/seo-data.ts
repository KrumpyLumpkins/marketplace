import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { tokenImage, tokenName } from "@/lib/marketplace/token-display";

const COLLECTION_CACHE_REVALIDATE_SECONDS = 300;
const TOKEN_CACHE_REVALIDATE_SECONDS = 60;

type TokenLike = {
  token_id?: unknown;
  image?: unknown;
  metadata?: unknown;
};

type TokenDetailsLike = {
  token?: TokenLike | null;
} | null;

type MarketplaceClientLike = {
  getCollection(options: {
    address: string;
    projectId?: string;
    fetchImages?: boolean;
  }): Promise<unknown>;
  getToken(options: {
    collection: string;
    tokenId: string;
    projectId?: string;
    fetchImages?: boolean;
  }): Promise<TokenDetailsLike>;
};

type MarketplaceModule = {
  createMarketplaceClient(config: unknown): Promise<MarketplaceClientLike>;
};

type CollectionSeoData = {
  exists: boolean;
  name: string;
  description: string | null;
  image: string | null;
};

type TokenSeoData = {
  exists: boolean;
  tokenName: string;
  collectionName: string;
  description: string | null;
  image: string | null;
  collectionImage: string | null;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeImageUrl(value: unknown) {
  const source = asNonEmptyString(value);
  if (!source) {
    return null;
  }

  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  if (source.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${source.slice("ipfs://".length)}`;
  }

  return null;
}

function alternateTokenId(rawTokenId: string) {
  const tokenId = rawTokenId.trim();
  if (!tokenId) {
    return null;
  }

  if (/^0x[0-9a-fA-F]+$/.test(tokenId)) {
    try {
      return BigInt(tokenId).toString();
    } catch {
      return null;
    }
  }

  if (/^\d+$/.test(tokenId)) {
    try {
      return `0x${BigInt(tokenId).toString(16)}`;
    } catch {
      return null;
    }
  }

  return null;
}

function hasUsableToken(data: TokenDetailsLike): data is { token: TokenLike } {
  return data !== null && data.token !== null && data.token !== undefined;
}

function resolveCollectionContext(address: string) {
  const config = getMarketplaceRuntimeConfig();
  const knownCollection = config.collections.find(
    (entry) => entry.address.toLowerCase() === address.toLowerCase(),
  );

  return {
    name: knownCollection?.name ?? address,
    projectId: knownCollection?.projectId,
  };
}

function collectionMetadata(rawCollection: unknown) {
  const fields = asRecord(rawCollection);
  const metadata = asRecord(fields?.metadata);

  const name = asNonEmptyString(metadata?.name);
  const description = asNonEmptyString(metadata?.description);
  const image =
    normalizeImageUrl(fields?.image) ??
    normalizeImageUrl(metadata?.image) ??
    normalizeImageUrl(metadata?.image_url);

  return {
    name,
    description,
    image,
  };
}

const loadMarketplaceModule = cache(async (): Promise<MarketplaceModule | null> => {
  try {
    return (await import("@/lib/marketplace/api-client")) as unknown as MarketplaceModule;
  } catch {
    return null;
  }
});

const getMarketplaceClient = cache(async (): Promise<MarketplaceClientLike | null> => {
  const marketplaceModule = await loadMarketplaceModule();
  if (!marketplaceModule) {
    return null;
  }

  try {
    const { sdkConfig } = getMarketplaceRuntimeConfig();
    return await marketplaceModule.createMarketplaceClient(sdkConfig);
  } catch {
    return null;
  }
});

async function _fetchCollectionUncached(address: string) {
  const context = resolveCollectionContext(address);
  const client = await getMarketplaceClient();

  if (!client) {
    return {
      context,
      collection: null,
    };
  }

  try {
    const collection = await client.getCollection({
      address,
      projectId: context.projectId,
      fetchImages: true,
    });

    return {
      context,
      collection,
    };
  } catch {
    return {
      context,
      collection: null,
    };
  }
}

const fetchCollectionCached = unstable_cache(
  _fetchCollectionUncached,
  ["seo-collection"],
  { revalidate: COLLECTION_CACHE_REVALIDATE_SECONDS },
);

// Per-request dedup on top of the cross-request edge cache.
const fetchCollection = cache((address: string) => fetchCollectionCached(address));

async function _fetchTokenWithFallbackUncached(options: {
  collection: string;
  tokenId: string;
  projectId?: string;
}) {
  const client = await getMarketplaceClient();
  if (!client) {
    return null;
  }

  let response: TokenDetailsLike = null;

  try {
    response = await client.getToken({
      collection: options.collection,
      tokenId: options.tokenId,
      projectId: options.projectId,
      fetchImages: true,
    });
  } catch {
    response = null;
  }

  if (hasUsableToken(response)) {
    return response;
  }

  const fallbackTokenId = alternateTokenId(options.tokenId);
  if (!fallbackTokenId || fallbackTokenId === options.tokenId) {
    return null;
  }

  try {
    const fallbackResponse = await client.getToken({
      collection: options.collection,
      tokenId: fallbackTokenId,
      projectId: options.projectId,
      fetchImages: true,
    });

    return hasUsableToken(fallbackResponse) ? fallbackResponse : null;
  } catch {
    return null;
  }
}

const fetchTokenWithFallbackCached = unstable_cache(
  (collection: string, tokenId: string, projectId?: string) =>
    _fetchTokenWithFallbackUncached({ collection, tokenId, projectId }),
  ["seo-token"],
  { revalidate: TOKEN_CACHE_REVALIDATE_SECONDS },
);

// Per-request dedup on top of the cross-request edge cache.
const fetchTokenWithFallback = cache(
  (options: { collection: string; tokenId: string; projectId?: string }) =>
    fetchTokenWithFallbackCached(options.collection, options.tokenId, options.projectId),
);

function normalizedTokenImage(token: TokenLike) {
  return normalizeImageUrl(tokenImage(token as never));
}

export async function getCollectionSeoData(address: string): Promise<CollectionSeoData> {
  const { context, collection } = await fetchCollection(address);

  if (!collection) {
    return {
      exists: false,
      name: context.name,
      description: null,
      image: null,
    };
  }

  const metadata = collectionMetadata(collection);

  return {
    exists: true,
    name: metadata.name ?? context.name,
    description: metadata.description,
    image: metadata.image,
  };
}

export async function getTokenSeoData(
  address: string,
  tokenId: string,
): Promise<TokenSeoData> {
  const context = resolveCollectionContext(address);
  const client = await getMarketplaceClient();

  // Fire both API calls in parallel — they are independent once the client exists.
  const [rawCollection, tokenDetail] = await Promise.all([
    client
      ? client
          .getCollection({
            address,
            projectId: context.projectId,
            fetchImages: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
    fetchTokenWithFallback({
      collection: address,
      tokenId,
      projectId: context.projectId,
    }),
  ]);

  const collectionInfo = collectionMetadata(rawCollection);
  const collectionName = collectionInfo.name ?? context.name;
  const collectionImage = collectionInfo.image;

  if (!tokenDetail?.token) {
    return {
      exists: false,
      tokenName: `Token #${tokenId}`,
      collectionName,
      description: null,
      image: null,
      collectionImage,
    };
  }

  const resolvedTokenName = tokenName(tokenDetail.token as never);

  return {
    exists: true,
    tokenName: resolvedTokenName,
    collectionName,
    description: `View listings and activity for ${resolvedTokenName}.`,
    image: normalizedTokenImage(tokenDetail.token),
    collectionImage,
  };
}
