import type { MarketplaceClientConfig } from "@/lib/marketplace/types";

const CHAIN_IDS = {
  LOCAL: "0x534e5f5345504f4c4941",
  SN_MAIN: "0x534e5f4d41494e",
  SN_SEPOLIA: "0x534e5f5345504f4c4941",
} as const;

const DEFAULT_CHAIN_ALIAS = "SN_SEPOLIA";
const DEFAULT_RUNTIME_MODE: MarketplaceClientConfig["runtime"] = "edge";

export type SeedCollection = {
  address: string;
  name: string;
  projectId?: string;
};

export type MarketplaceFeatureFlags = {
  enableDeferredMetadataHydration: boolean;
};

export type MarketplaceRuntimeConfig = {
  chainLabel: keyof typeof CHAIN_IDS | "custom";
  sdkConfig: MarketplaceClientConfig;
  featureFlags: MarketplaceFeatureFlags;
  collections: SeedCollection[];
  warnings: string[];
};

type MarketplaceEnv = Partial<
  Record<
    | "NEXT_PUBLIC_MARKETPLACE_CHAIN_ID"
    | "NEXT_PUBLIC_MARKETPLACE_DEFAULT_PROJECT"
    | "NEXT_PUBLIC_MARKETPLACE_COLLECTIONS"
    | "NEXT_PUBLIC_MARKETPLACE_RUNTIME"
    | "NEXT_PUBLIC_MARKETPLACE_ENABLE_DEFERRED_METADATA",
    string | undefined
  >
>;

function resolveChainId(
  value: string | undefined,
  warnings: string[],
): { chainLabel: MarketplaceRuntimeConfig["chainLabel"]; chainId: string } {
  if (!value) {
    return {
      chainLabel: DEFAULT_CHAIN_ALIAS,
      chainId: CHAIN_IDS[DEFAULT_CHAIN_ALIAS],
    };
  }

  const normalized = value.trim();
  if (normalized in CHAIN_IDS) {
    const alias = normalized as keyof typeof CHAIN_IDS;
    return { chainLabel: alias, chainId: CHAIN_IDS[alias] };
  }

  if (normalized.startsWith("0x")) {
    return { chainLabel: "custom", chainId: normalized };
  }

  warnings.push(
    `NEXT_PUBLIC_MARKETPLACE_CHAIN_ID "${value}" is invalid. Falling back to ${DEFAULT_CHAIN_ALIAS}.`,
  );

  return {
    chainLabel: DEFAULT_CHAIN_ALIAS,
    chainId: CHAIN_IDS[DEFAULT_CHAIN_ALIAS],
  };
}

function parseCollections(value: string | undefined, warnings: string[]) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [address, name, projectId] = entry.split("|").map((v) => v?.trim());

      if (!address || !name) {
        warnings.push(
          `Skipping malformed collection entry "${entry}". Expected address|name|projectId.`,
        );
        return [];
      }

      return [{
        address,
        name: name === "Beasts V2.1" ? "Beasts" : name,
        projectId: projectId || undefined,
      }];
    });
}

function parseRuntimeMode(
  value: string | undefined,
  warnings: string[],
): MarketplaceClientConfig["runtime"] {
  if (!value) {
    return DEFAULT_RUNTIME_MODE;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "edge" || normalized === "dojo") {
    return normalized;
  }

  warnings.push(
    `NEXT_PUBLIC_MARKETPLACE_RUNTIME "${value}" is invalid. Falling back to ${DEFAULT_RUNTIME_MODE}.`,
  );
  return DEFAULT_RUNTIME_MODE;
}

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }

  return fallback;
}

export function getMarketplaceRuntimeConfigFromEnv(
  env: MarketplaceEnv,
): MarketplaceRuntimeConfig {
  const warnings: string[] = [];
  const { chainLabel, chainId } = resolveChainId(
    env.NEXT_PUBLIC_MARKETPLACE_CHAIN_ID,
    warnings,
  );
  const collections = parseCollections(
    env.NEXT_PUBLIC_MARKETPLACE_COLLECTIONS,
    warnings,
  );
  const defaultProject = env.NEXT_PUBLIC_MARKETPLACE_DEFAULT_PROJECT?.trim() || undefined;
  const runtime = parseRuntimeMode(env.NEXT_PUBLIC_MARKETPLACE_RUNTIME, warnings);
  const featureFlags: MarketplaceFeatureFlags = {
    enableDeferredMetadataHydration: parseBooleanFlag(
      env.NEXT_PUBLIC_MARKETPLACE_ENABLE_DEFERRED_METADATA,
      false,
    ),
  };

  return {
    chainLabel,
    featureFlags,
    collections,
    warnings,
    sdkConfig: {
      chainId: chainId as MarketplaceClientConfig["chainId"],
      defaultProject,
      runtime,
    },
  };
}

let _cachedConfig: MarketplaceRuntimeConfig | null = null;

export function getMarketplaceRuntimeConfig(): MarketplaceRuntimeConfig {
  if (!_cachedConfig) {
    _cachedConfig = getMarketplaceRuntimeConfigFromEnv({
      NEXT_PUBLIC_MARKETPLACE_CHAIN_ID: process.env.NEXT_PUBLIC_MARKETPLACE_CHAIN_ID,
      NEXT_PUBLIC_MARKETPLACE_COLLECTIONS:
        process.env.NEXT_PUBLIC_MARKETPLACE_COLLECTIONS,
      NEXT_PUBLIC_MARKETPLACE_DEFAULT_PROJECT:
        process.env.NEXT_PUBLIC_MARKETPLACE_DEFAULT_PROJECT,
      NEXT_PUBLIC_MARKETPLACE_RUNTIME:
        process.env.NEXT_PUBLIC_MARKETPLACE_RUNTIME,
      NEXT_PUBLIC_MARKETPLACE_ENABLE_DEFERRED_METADATA:
        process.env.NEXT_PUBLIC_MARKETPLACE_ENABLE_DEFERRED_METADATA,
    });
  }
  return _cachedConfig;
}

/** @internal — exposed for test teardown only */
export function _resetConfigCache() {
  _cachedConfig = null;
}
