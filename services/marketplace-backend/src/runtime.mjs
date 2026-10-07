import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Store } from "./store.mjs";
import { RpcClient } from "./rpc.mjs";
import { address } from "./domain.mjs";
export function runtime(env = process.env) {
  const registry = JSON.parse(
    env.MARKETPLACE_REGISTRY_JSON || readFileSync(
      env.MARKETPLACE_REGISTRY_PATH ??
        new URL("../../../config/marketplace/registry.json", import.meta.url),
      "utf8",
    ),
  );
  const chain = env.MARKETPLACE_CHAIN ?? "SN_MAIN",
    settings = registry.chains[chain];
  if (!settings) throw new Error(`Chain ${chain} is not registered.`);
  const config = {
    ...settings,
    chain,
    origin: env.MARKETPLACE_ORIGIN ?? "http://localhost:3000",
    operatorToken: env.MARKETPLACE_OPERATOR_TOKEN,
    trustedProxyHosts: env.MARKETPLACE_TRUSTED_PROXY_HOSTS?.split(",").map(s => s.trim()).filter(Boolean),
    trustedProxyAddresses: env.MARKETPLACE_TRUSTED_PROXY_ADDRESSES?.split(",").map(s => s.trim()).filter(Boolean),
    ipfsGateway: env.MARKETPLACE_IPFS_GATEWAY ?? "https://ipfs.io/ipfs",
    assetDir: resolve(
      env.MARKETPLACE_ASSET_DIR ?? "services/marketplace-backend/data/assets",
    ),
  };
  if (env.MARKETPLACE_ADDRESS)
    config.marketplace = address(env.MARKETPLACE_ADDRESS);
  if (env.MARKETPLACE_START_BLOCK)
    config.marketplaceStartBlock = Number(env.MARKETPLACE_START_BLOCK);
  if (env.MARKETPLACE_CLASS_HASH)
    config.marketplaceClassHash = env.MARKETPLACE_CLASS_HASH;
  const path = resolve(
    env.MARKETPLACE_DB ?? `services/marketplace-backend/data/${chain}.sqlite`,
  );
  mkdirSync(dirname(path), { recursive: true });
  const store = new Store(path);
  for (const c of config.collections)
    store.put("collection", address(c.address), {
      ...c,
      address: address(c.address),
      verified: false,
      ...store.get("collection", address(c.address)),
    });
  const urls = [
    env.MARKETPLACE_RPC_URL,
    env.MARKETPLACE_RPC_FALLBACK_URL,
  ].filter(Boolean);
  const rpc = urls.length ? new RpcClient(urls) : null;
  return { store, config, rpc };
}
