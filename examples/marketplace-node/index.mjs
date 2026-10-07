import { createMarketplaceClient } from "@biblio/marketplace";
const [apiUrl, chain, chainId] = process.argv.slice(2);
if (!apiUrl || !chain || !chainId)
  throw new Error(
    "Usage: node examples/marketplace-node/index.mjs API_URL CHAIN CHAIN_ID",
  );
const marketplace = createMarketplaceClient({ apiUrl, chain, chainId });
try {
  console.log(JSON.stringify(await marketplace.collections.list(), null, 2));
} finally {
  marketplace.dispose();
}
