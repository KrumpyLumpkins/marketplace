import {runSdkDevnetJourney} from "../packages/devnet-journey.mjs";
// Development tooling only. The production backend has no Starknet.js dependency.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { preflight } from "../../services/marketplace-backend/src/preflight.mjs";
import { Auth } from "../../services/marketplace-backend/src/auth.mjs";
import { SELECTORS } from "../../services/marketplace-backend/src/decode.mjs";
import { refreshMetadata } from "../../services/marketplace-backend/src/metadata.mjs";
import { Store } from "../../services/marketplace-backend/src/store.mjs";
import { RpcClient } from "../../services/marketplace-backend/src/rpc.mjs";
import { scanOnce } from "../../services/marketplace-backend/src/indexer.mjs";
import { address } from "../../services/marketplace-backend/src/domain.mjs";
const require = createRequire(import.meta.url),
  starknet = require("starknet-devnet-sdk");
const url = process.env.DEVNET_URL ?? "http://127.0.0.1:5050";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
  throw new Error("This fixture script only runs against a local devnet.");
const rpc = new RpcClient([url]);
const raw = await rpc.call("devnet_getPredeployedAccounts", {});
const provider = new starknet.RpcProvider({ nodeUrl: url });
const [admin, seller, buyer] = raw.map(
  (a) =>
    new starknet.Account({
      provider,
      address: a.address,
      signer: a.private_key,
    }),
);
const artifacts = new URL(
  "../../contracts/marketplace/target/dev/",
  import.meta.url,
);
async function deploy(name, constructorCalldata = []) {
  const contract = JSON.parse(
    readFileSync(
      new URL(`biblio_marketplace_${name}.contract_class.json`, artifacts),
      "utf8",
    ),
  );
  const casm = JSON.parse(
    readFileSync(
      new URL(
        `biblio_marketplace_${name}.compiled_contract_class.json`,
        artifacts,
      ),
      "utf8",
    ),
  );
  const result = await admin.declareAndDeploy({
    contract,
    casm,
    constructorCalldata,
  });
  console.log(
    JSON.stringify({ deployed: name, address: result.deploy.contract_address }),
  );
  return {
    address: result.deploy.contract_address,
    classHash: result.declare.class_hash,
  };
}
async function execute(account, calls) {
  const tx = await account.execute(calls);
  const receipt = await provider.waitForTransaction(tx.transaction_hash, {
    retryInterval: 100,
  });
  assert.equal(receipt.execution_status, "SUCCEEDED");
  return receipt;
}
const call = (contractAddress, entrypoint, calldata = []) => ({
  contractAddress,
  entrypoint,
  calldata: calldata.map(String),
});
const market = await deploy("Marketplace", [admin.address, 200, admin.address]);
const currency = await deploy("MockCurrency");
const nft = await deploy("MockNft");
const config = {
  chain: "LOCAL",
  chainId: await rpc.call("starknet_chainId", []),
  marketplace: market.address,
  marketplaceClassHash: market.classHash,
  marketplaceStartBlock: 0,
  collections: [{ address: nft.address, name: "Local NFTs", startBlock: 0 }],
  currencies: [{ address: currency.address, symbol: "TEST", decimals: 0 }],
};
const store = new Store(":memory:");
await execute(admin, [
  call(market.address, "set_collection", [nft.address, 1]),
  call(market.address, "set_currency", [currency.address, 1]),
  call(currency.address, "mint", [buyer.address, 10000, 0]),
  ...[0, 1, 2, 3].map((id) =>
    call(nft.address, "mint", [seller.address, id, 0]),
  ),
  call(nft.address, "set_royalty", [admin.address, 5, 0]),
]);
const expiry = Math.floor(Date.now() / 1000) + 86400;
await execute(seller, [
  ...[0, 1, 2, 3].map((id) =>
    call(nft.address, "approve", [market.address, id, 0]),
  ),
  call(market.address, "create_listing", [
    nft.address,
    0,
    0,
    currency.address,
    100,
    0,
    expiry,
    5,
    0,
  ]),
  call(market.address, "create_listing", [
    nft.address,
    1,
    0,
    currency.address,
    100,
    0,
    expiry,
    5,
    0,
  ]),
]);
await scanOnce(store, rpc, config, { window: 1000 });
const quote = await preflight(store, rpc, config, {
  account: buyer.address,
  items: [
    {
      maker: seller.address,
      nonce: "1",
      buyerDebit: "100",
      currency: currency.address,
    },
    {
      maker: seller.address,
      nonce: "2",
      buyerDebit: "100",
      currency: currency.address,
    },
  ],
});
assert.equal(quote.canSubmit, true);
assert.equal(quote.total, "200");
assert.equal(quote.approvalAmount, "200");
const cart = await execute(buyer, [
  call(currency.address, "approve", [market.address, 10000, 0]),
  call(market.address, "buy_many", [
    2,
    seller.address,
    1,
    seller.address,
    2,
    currency.address,
    200,
    0,
    expiry,
  ]),
]);
await execute(buyer, [
  call(market.address, "create_offer", [
    nft.address,
    2,
    0,
    currency.address,
    100,
    0,
    expiry,
    5,
    0,
  ]),
  call(market.address, "create_collection_offer", [
    nft.address,
    currency.address,
    100,
    0,
    expiry,
    10,
    0,
  ]),
]);
await execute(seller, [
  call(market.address, "accept_offer", [
    buyer.address,
    1,
    currency.address,
    93,
    0,
  ]),
  call(market.address, "accept_collection_offer", [
    buyer.address,
    2,
    3,
    0,
    currency.address,
    88,
    0,
  ]),
]);
await execute(buyer, [
  call(market.address, "create_listing", [
    nft.address,
    0,
    0,
    currency.address,
    200,
    0,
    expiry,
    5,
    0,
  ]),
  call(market.address, "cancel_order", [3]),
]);
await scanOnce(store, rpc, config, { window: 1000 });
assert.equal(store.list("order").length, 5);
assert.deepEqual(
  store
    .list("order")
    .map((o) => o.state)
    .sort(),
  ["cancelled", "filled", "filled", "filled", "filled"],
);
for (const token of store.list("token"))
  assert.equal(token.owner, address(buyer.address));
const state = JSON.stringify({
  orders: store.list("order"),
  tokens: store.list("token"),
});
store.rewind(-1);
await scanOnce(store, rpc, config, { window: 1000 });
assert.equal(
  JSON.stringify({ orders: store.list("order"), tokens: store.list("token") }),
  state,
);
await refreshMetadata(store, rpc, config, { limit: 10 });
assert.equal(
  store.list("token").every((t) => t.metadata.name === "Local NFT"),
  true,
);
const auth = new Auth(store, {
  origin: "http://localhost:3000",
  chainId: config.chainId,
  verify: async (account, hash, signature) => {
    const result = await rpc.contract(account, SELECTORS.is_valid_signature, [
      hash,
      String(signature.length),
      ...signature,
    ]);
    return BigInt(result[0]) === 0x56414c4944n;
  },
});
const challenge = auth.challenge(buyer.address, "http://localhost:3000");
const signed = await buyer.signMessage(challenge.typedData);
const signature = Array.isArray(signed) ? signed : [signed.r, signed.s];
const session = await auth.verify(challenge.id, signature);
assert.equal(auth.account(session.token), address(buyer.address));
await assert.rejects(auth.verify(challenge.id, signature));
// Account-level maximum-cart resource measurement, including 25 independent orders.
await execute(
  admin,
  Array.from({ length: 25 }, (_, i) =>
    call(nft.address, "mint", [seller.address, 100 + i, 0]),
  ),
);
await execute(
  seller,
  Array.from({ length: 25 }, (_, i) => [
    call(nft.address, "approve", [market.address, 100 + i, 0]),
    call(market.address, "create_listing", [
      nft.address,
      100 + i,
      0,
      currency.address,
      100,
      0,
      expiry,
      5,
      0,
    ]),
  ]).flat(),
);
const maximumCart = await execute(buyer, [
  call(market.address, "buy_many", [
    25,
    ...Array.from({ length: 25 }, (_, i) => [seller.address, 3 + i]).flat(),
    currency.address,
    2500,
    0,
    expiry,
  ]),
]);
await scanOnce(store, rpc, config, { window: 1000 });
assert.equal(
  store.list("order").filter((o) => o.state === "filled").length,
  29,
);
await execute(
  admin,
  Array.from({ length: 25 }, (_, i) =>
    call(nft.address, "mint", [seller.address, 200 + i, 0]),
  ),
);
await execute(
  seller,
  Array.from({ length: 25 }, (_, i) => [
    call(nft.address, "approve", [market.address, 200 + i, 0]),
    call(market.address, "create_listing", [
      nft.address,
      200 + i,
      0,
      currency.address,
      100,
      0,
      expiry,
      5,
      0,
    ]),
  ]).flat(),
);
const repeatedFills = await execute(
  buyer,
  Array.from({ length: 25 }, (_, i) =>
    call(market.address, "buy_listing", [
      seller.address,
      28 + i,
      currency.address,
      100,
      0,
    ]),
  ),
);
await scanOnce(store, rpc, config, { window: 1000 });
const sdkJourney = await runSdkDevnetJourney({store,rpc,provider,config,admin,seller,buyer,nft,currency,execute,call});
const chainProjection = () =>
  JSON.stringify({
    orders: store.list("order"),
    tokens: store
      .list("token")
      .map((t) => ({ id: t.id, owner: t.owner, updatedAt: t.updatedAt })),
    stats: store.list("stats_day"),
    floors: store.list("floor_history"),
    configuration:store.list("config"),
    policies:store.list("policy"),
  });
const finalProjection = chainProjection();
store.rewind(-1);
await scanOnce(store, rpc, config, { window: 1000 });
assert.equal(chainProjection(), finalProjection);
const report = {
  at: new Date().toISOString(),
  contracts: { market, currency, nft },
  head: store.head(),
  orders: store.list("order").length,
  tokens: store.list("token").length,
  cartResources: cart.execution_resources,
  maximumCartResources: maximumCart.execution_resources,
  repeatedFillsResources: repeatedFills.execution_resources,
  sdkJourney,
  replayIdentical: true,
  livePreflight: true,
  walletSignatureVerified: true,
  metadataDecoded: true,
};
mkdirSync(new URL("../../.context/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../../.context/devnet-evidence.json", import.meta.url),
  JSON.stringify(report, null, 2),
);
writeFileSync(
  new URL("../../.context/devnet-registry.json", import.meta.url),
  JSON.stringify({ chains: { LOCAL: config } }, null, 2),
);
console.log(JSON.stringify(report));
store.close();
