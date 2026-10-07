import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Deployer, hash } from "starknet-devnet-sdk";
export const CHAINS = {
  SN_MAIN: "0x534e5f4d41494e",
  SN_SEPOLIA: "0x534e5f5345504f4c4941",
};
export const STEPS = ["declare", "deploy", "configure", "activate"];
const FIELD = (1n << 251n) + 17n * (1n << 192n) + 1n;
export function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}
export function integer(value, bits, label) {
  requireValue(
    typeof value === "string" ||
      typeof value === "bigint" ||
      (typeof value === "number" && Number.isSafeInteger(value)),
    `${label}: use an exact integer`,
  );
  requireValue(
    /^(0x[\da-f]+|\d+)$/i.test(String(value)),
    `${label}: invalid integer`,
  );
  const n = BigInt(value);
  requireValue(n >= 0n && n < 1n << BigInt(bits), `${label}: out of range`);
  return n;
}
export function felt(value, label = "felt", allowZero = false) {
  const n = integer(value, 252, label);
  requireValue(n < FIELD && (allowZero || n > 0n), `${label}: invalid felt`);
  return "0x" + n.toString(16);
}
export function address(value, label = "address") {
  const n = integer(value, 251, label);
  requireValue(n > 0n, `${label}: zero address`);
  return "0x" + n.toString(16);
}
export const same = (a, b) => BigInt(a) === BigInt(b);
function sorted(value) {
  return Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, sorted(value[k])]),
        )
      : value;
}
export const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(sorted(value)))
    .digest("hex");
const fileHash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
function text(value, label) {
  requireValue(
    typeof value === "string" && value.trim().length > 0,
    `${label}: required`,
  );
  return value.trim();
}
function keys(obj, allowed, label) {
  requireValue(
    obj && typeof obj === "object" && !Array.isArray(obj),
    `${label}: expected object`,
  );
  for (const k of Object.keys(obj))
    requireValue(allowed.includes(k), `${label}: unknown key ${k}`);
}
export function validateConfig(input) {
  keys(
    input,
    [
      "schemaVersion",
      "network",
      "deployer",
      "deployerClassHash",
      "administrator",
      "administratorClassHash",
      "feeRecipient",
      "feeBps",
      "salt",
      "udc",
      "maxFeeFri",
      "collections",
      "currencies",
      "release",
    ],
    "config",
  );
  requireValue(
    input.schemaVersion === 1 &&
      typeof input.network === "string" &&
      Object.hasOwn(CHAINS, input.network),
    "Unsupported deployment schema/network",
  );
  requireValue(
    Number.isInteger(input.feeBps) && input.feeBps >= 0 && input.feeBps <= 500,
    "feeBps must be 0–500",
  );
  keys(input.udc, ["address", "classHash"], "udc");
  const config = {
    schemaVersion: 1,
    network: input.network,
    deployer: address(input.deployer, "deployer"),
    deployerClassHash: felt(input.deployerClassHash, "deployerClassHash"),
    administrator: address(input.administrator, "administrator"),
    administratorClassHash: felt(
      input.administratorClassHash,
      "administratorClassHash",
    ),
    feeRecipient: address(input.feeRecipient, "feeRecipient"),
    feeBps: input.feeBps,
    salt: felt(input.salt, "salt", true),
    udc: {
      address: address(input.udc.address, "UDC"),
      classHash: felt(input.udc.classHash, "UDC class"),
    },
    maxFeeFri: integer(input.maxFeeFri, 256, "maxFeeFri").toString(),
    collections: [],
    currencies: [],
    release: {},
  };
  requireValue(BigInt(config.maxFeeFri) > 0n, "maxFeeFri must be positive");
  for (const type of ["collections", "currencies"]) {
    requireValue(
      Array.isArray(input[type]) && input[type].length > 0,
      `${type}: choose a reviewed nonempty asset list`,
    );
    const seen = new Set();
    config[type] = input[type].map((row) => {
      keys(
        row,
        type === "collections"
          ? [
              "address",
              "classHash",
              "name",
              "startBlock",
              "royalties",
              "review",
            ]
          : ["address", "classHash", "symbol", "decimals", "review"],
        type,
      );
      const a = address(row.address);
      requireValue(!seen.has(a), `Duplicate ${type} address`);
      seen.add(a);
      const common = {
        address: a,
        classHash: felt(row.classHash),
        review: text(row.review, "asset review"),
      };
      if (type === "collections") {
        requireValue(
          typeof row.royalties === "boolean",
          "royalties: explicitly choose true/false",
        );
        requireValue(
          Number.isSafeInteger(row.startBlock) && row.startBlock >= 0,
          "collection startBlock: nonnegative safe integer",
        );
        return {
          ...common,
          name: text(row.name, "collection name"),
          startBlock: row.startBlock,
          royalties: row.royalties,
        };
      }
      requireValue(
        Number.isInteger(row.decimals) &&
          row.decimals >= 0 &&
          row.decimals <= 255,
        "currency decimals: invalid",
      );
      return {
        ...common,
        symbol: text(row.symbol, "currency symbol"),
        decimals: row.decimals,
      };
    });
  }
  requireValue(
    config.collections.length + config.currencies.length <= 24,
    "Configure supports at most 24 assets per reviewed plan",
  );
  keys(
    input.release ?? {},
    [
      "contractAudit",
      "assetCompatibility",
      "sepoliaRehearsal",
      "releaseApproval",
    ],
    "release",
  );
  for (const [key, value] of Object.entries(input.release ?? {})) {
    requireValue(
      typeof value === "string",
      `release.${key}: expected evidence reference`,
    );
    config.release[key] = value.trim();
  }
  return config;
}
export function loadArtifacts(root) {
  const base = new URL("contracts/marketplace/", root);
  const manifest = JSON.parse(
    readFileSync(new URL("artifact-manifest.json", base)),
  );
  const contract = JSON.parse(
    readFileSync(
      new URL(
        "target/dev/biblio_marketplace_Marketplace.contract_class.json",
        base,
      ),
    ),
  );
  const casm = JSON.parse(
    readFileSync(
      new URL(
        "target/dev/biblio_marketplace_Marketplace.compiled_contract_class.json",
        base,
      ),
    ),
  );
  const abi = JSON.parse(readFileSync(new URL("abi.json", base)));
  requireValue(
    manifest.scarb === "2.15.1" && manifest.version === 1,
    "Unreviewed artifact manifest version",
  );
  requireValue(
    fileHash(new URL("src/lib.cairo", base)) === manifest.sourceSha256,
    "Production source differs from reviewed manifest",
  );
  requireValue(
    same(hash.computeContractClassHash(contract), manifest.classHash),
    "Sierra class hash mismatch: rebuild WITHOUT fixtures",
  );
  requireValue(
    same(hash.computeCompiledClassHash(casm), manifest.compiledClassHash),
    "CASM hash mismatch",
  );
  requireValue(
    digest(contract.abi) === digest(abi),
    "ABI differs from reviewed artifact",
  );
  return {
    contract,
    casm,
    identity: {
      classHash: felt(manifest.classHash),
      compiledClassHash: felt(manifest.compiledClassHash),
      sourceSha256: manifest.sourceSha256,
      abiSha256: digest(abi),
      scarb: manifest.scarb,
    },
  };
}
export function buildPlan(input, artifacts, gitCommit) {
  const config = validateConfig(input);
  const constructorCalldata = [
    config.administrator,
    String(config.feeBps),
    config.feeRecipient,
  ];
  const deployment = new Deployer(
    config.udc.address,
    "deploy_contract",
  ).buildDeployerCall(
    {
      classHash: artifacts.classHash,
      salt: config.salt,
      unique: true,
      constructorCalldata,
    },
    config.deployer,
  );
  const market = address(deployment.addresses[0]);
  const call = (entrypoint, calldata) => ({
    contractAddress: market,
    entrypoint,
    calldata: calldata.map(String),
  });
  const plan = {
    schemaVersion: 1,
    config,
    artifacts,
    gitCommit,
    chainId: CHAINS[config.network],
    address: market,
    constructorCalldata,
    steps: {
      declare: { sender: config.deployer },
      deploy: {
        sender: config.deployer,
        calls: deployment.calls.map((c) => ({
          ...c,
          calldata: c.calldata.map(String),
        })),
      },
      configure: {
        sender: config.administrator,
        calls: [
          call("set_paused", [1]),
          ...config.currencies.map((c) => call("set_currency", [c.address, 1])),
          ...config.collections.map((c) =>
            call("set_collection", [c.address, 1]),
          ),
        ],
      },
      activate: {
        sender: config.administrator,
        calls: [call("set_paused", [0])],
      },
    },
  };
  return { ...plan, planId: digest(plan) };
}
export function checkPlan(plan) {
  requireValue(plan?.schemaVersion === 1, "Invalid plan");
  requireValue(
    buildPlan(plan.config, plan.artifacts, plan.gitCommit).planId ===
      plan.planId,
    "Plan content or approval digest changed",
  );
  const { planId, ...contents } = plan;
  requireValue(digest(contents) === planId, "Plan was modified");
  return plan;
}
export function activationEvidence(plan, value) {
  keys(
    value,
    ["planId", "indexerReconciliation", "walletSmoke", "activationApproval"],
    "activation evidence",
  );
  requireValue(
    value.planId === plan.planId,
    "Activation approval belongs to another plan",
  );
  return {
    planId: plan.planId,
    indexerReconciliation: text(
      value.indexerReconciliation,
      "indexerReconciliation",
    ),
    walletSmoke: text(value.walletSmoke, "walletSmoke"),
    activationApproval: text(value.activationApproval, "activationApproval"),
  };
}
export function mainnetBlockers(plan, step, activation) {
  if (plan.config.network !== "SN_MAIN") return [];
  const missing = [
    "contractAudit",
    "assetCompatibility",
    "sepoliaRehearsal",
    "releaseApproval",
  ].filter((k) => !plan.config.release[k]);
  if (step === "activate") {
    if (activation?.planId !== plan.planId) missing.push("activationPlanId");
    for (const key of [
      "indexerReconciliation",
      "walletSmoke",
      "activationApproval",
    ])
      if (typeof activation?.[key] !== "string" || !activation[key].trim())
        missing.push(key);
  }
  return missing;
}
export function maximumFee(bounds) {
  requireValue(
    bounds &&
      Object.keys(bounds).every((k) =>
        ["l1_gas", "l1_data_gas", "l2_gas"].includes(k),
      ),
    "Unknown fee resource",
  );
  let total = 0n;
  for (const key of ["l1_gas", "l1_data_gas", "l2_gas"]) {
    requireValue(bounds?.[key], `Missing ${key} resource bounds`);
    total +=
      integer(bounds[key].max_amount, 64, "max_amount") *
      integer(bounds[key].max_price_per_unit, 128, "max_price_per_unit");
  }
  return total;
}
