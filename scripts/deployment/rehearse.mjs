import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Account, RpcProvider, constants } from "starknet-devnet-sdk";
const url = process.env.DEVNET_URL ?? "http://127.0.0.1:5050";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Deployment rehearsals only run on localhost devnet");
const provider = new RpcProvider({ nodeUrl: url });
const accounts = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "devnet_getPredeployedAccounts",
    params: {},
  }),
})
  .then((r) => r.json())
  .then((x) => x.result);
const [adminRaw, deployerRaw] = accounts;
const admin = new Account({
  provider,
  address: adminRaw.address,
  signer: adminRaw.private_key,
});
mkdirSync(".context/deployment-rehearsals", { recursive: true });
const dir = mkdtempSync(".context/deployment-rehearsals/run-");
execFileSync("scarb", ["build", "--features", "fixtures"], {
  cwd: "contracts/marketplace",
  stdio: "inherit",
});
const load = (name, kind = "contract_class") =>
  JSON.parse(
    readFileSync(
      `contracts/marketplace/target/dev/biblio_marketplace_${name}.${kind}.json`,
    ),
  );
async function fixture(name) {
  const r = await admin.declareAndDeploy({
    contract: load(name),
    casm: load(name, "compiled_contract_class"),
    constructorCalldata: [],
  });
  return r.deploy.contract_address;
}
const nft = await fixture("MockNft"),
  currency = await fixture("MockCurrency");
const config = {
  schemaVersion: 1,
  network: "SN_SEPOLIA",
  deployer: deployerRaw.address,
  deployerClassHash: await provider.getClassHashAt(deployerRaw.address),
  administrator: adminRaw.address,
  administratorClassHash: await provider.getClassHashAt(adminRaw.address),
  feeRecipient: adminRaw.address,
  feeBps: 200,
  salt: "0x" + randomBytes(31).toString("hex"),
  udc: {
    address: constants.UDC.ADDRESS,
    classHash: await provider.getClassHashAt(constants.UDC.ADDRESS),
  },
  maxFeeFri: "10000000000000000000",
  collections: [
    {
      address: nft,
      classHash: await provider.getClassHashAt(nft),
      name: "Deployment fixture",
      startBlock: 0,
      royalties: true,
      review: "local fixture only",
    },
  ],
  currencies: [
    {
      address: currency,
      classHash: await provider.getClassHashAt(currency),
      symbol: "TEST",
      decimals: 18,
      review: "local fixture only",
    },
  ],
  release: {},
};
writeFileSync(`${dir}/config.json`, JSON.stringify(config, null, 2));
function cli(args, signer = deployerRaw) {
  return execFileSync("node", ["scripts/deployment/cli.mjs", ...args], {
    env: {
      ...process.env,
      DEPLOYMENT_RPC_URL: url,
      DEPLOYMENT_SIGNER_ADDRESS: signer.address,
      DEPLOYMENT_SIGNER_PRIVATE_KEY: signer.private_key,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
console.log(
  cli(["plan", "--config", `${dir}/config.json`, "--out", `${dir}/plan.json`]),
);
const plan = JSON.parse(readFileSync(`${dir}/plan.json`));
for (const step of ["declare", "deploy", "configure"]) {
  console.log(
    step,
    cli(
      [
        "send",
        "--plan",
        `${dir}/plan.json`,
        "--step",
        step,
        "--approve",
        plan.planId,
      ],
      step === "configure" ? adminRaw : deployerRaw,
    ),
  );
  console.log(cli(["confirm", "--plan", `${dir}/plan.json`, "--step", step]));
}
console.log(cli(["verify", "--plan", `${dir}/plan.json`]));
console.log(
  cli([
    "export",
    "--plan",
    `${dir}/plan.json`,
    "--out-dir",
    `${dir}/handoff-paused`,
  ]),
);
const paused = JSON.parse(
  readFileSync(`${dir}/handoff-paused/deployment.json`),
);
assert.equal(paused.paused, true);
const nonceBefore = await provider.getNonceForAddress(deployerRaw.address);
console.log(
  cli([
    "send",
    "--plan",
    `${dir}/plan.json`,
    "--step",
    "deploy",
    "--approve",
    plan.planId,
  ]),
);
assert.equal(
  await provider.getNonceForAddress(deployerRaw.address),
  nonceBefore,
);

writeFileSync(
  `${dir}/activation-evidence.json`,
  JSON.stringify(
    {
      planId: plan.planId,
      indexerReconciliation: "local fixture policy verification only",
      walletSmoke: "local signed-account rehearsal only",
      activationApproval: "local test only",
    },
    null,
    2,
  ),
);
console.log(
  cli([
    "calls",
    "--plan",
    `${dir}/plan.json`,
    "--step",
    "activate",
    "--activation-evidence",
    `${dir}/activation-evidence.json`,
    "--out",
    `${dir}/activate.json`,
  ]),
);
const activation = JSON.parse(readFileSync(`${dir}/activate.json`));
const tx = await admin.execute(activation.calls, { tip: 0n });
await provider.waitForTransaction(tx.transaction_hash);
console.log(
  cli([
    "confirm",
    "--plan",
    `${dir}/plan.json`,
    "--step",
    "activate",
    "--hash",
    tx.transaction_hash,
    "--activation-evidence",
    `${dir}/activation-evidence.json`,
  ]),
);
console.log(cli(["verify", "--plan", `${dir}/plan.json`]));
console.log(
  cli([
    "export",
    "--plan",
    `${dir}/plan.json`,
    "--out-dir",
    `${dir}/handoff-active`,
  ]),
);
assert.equal(
  JSON.parse(readFileSync(`${dir}/handoff-active/deployment.json`)).paused,
  false,
);
console.log(
  "Deployment rehearsal passed: distinct deployer/admin, frozen artifacts, declare/deploy/configure, paused export, external governance activation and canonical receipt recovery.",
);

assert.equal(
  JSON.parse(readFileSync(`${dir}/handoff-active/deployment.json`))
    .activationEvidence.planId,
  plan.planId,
);
