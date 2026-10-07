import {
  createMarketplaceClient,
  type MarketplaceClient,
} from "@biblio/marketplace";
import { getMarketplaceRuntimeConfig } from "./config";
let browserClient: MarketplaceClient | undefined;
let identity = "";
/** Application configuration is translated here; published packages never read Next.js environment variables. */
export function getAppMarketplaceClient() {
  const runtime = getMarketplaceRuntimeConfig();
  const apiUrl =
    typeof window === "undefined"
      ? (process.env.MARKETPLACE_API_URL ?? "http://127.0.0.1:3100")
      : (process.env.NEXT_PUBLIC_MARKETPLACE_API_BASE ?? "/api/marketplace");
  const expectedMarketplace = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS;
  const key = JSON.stringify([apiUrl, runtime.chainLabel, expectedMarketplace]);
  if (typeof window === "undefined")
    return createMarketplaceClient({
      apiUrl,
      assetBaseUrl:
        process.env.NEXT_PUBLIC_MARKETPLACE_API_BASE ?? "/api/marketplace",
      chain: runtime.chainLabel,
      chainId: String(runtime.sdkConfig?.chainId ?? "0x1"),
      expectedMarketplace,
    });
  if (!browserClient || identity !== key) {
    browserClient?.dispose();
    browserClient = createMarketplaceClient({
      apiUrl,
      assetBaseUrl:
        process.env.NEXT_PUBLIC_MARKETPLACE_API_BASE ?? "/api/marketplace",
      chain: runtime.chainLabel,
      chainId: String(runtime.sdkConfig?.chainId ?? "0x1"),
      expectedMarketplace,
    });
    identity = key;
  }
  return browserClient;
}
