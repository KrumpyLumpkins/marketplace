import { hash, transaction } from "starknet-devnet-sdk";
import {
  activationEvidence,
  address,
  checkPlan,
  digest,
  felt,
  mainnetBlockers,
  maximumFee,
  requireValue,
  same,
  STEPS,
} from "./plan.mjs";
const sel = (name) => hash.getSelectorFromName(name);
function decodeEvent(event) {
  const tag = event.keys[0];
  const data = event.data;
  const bool = (value) => {
    requireValue(
      value != null && [0n, 1n].includes(BigInt(value)),
      "Invalid boolean event",
    );
    return BigInt(value) === 1n;
  };
  if (same(tag, sel("MarketplaceInitialized"))) {
    requireValue(
      event.keys.length === 1 && data.length === 4,
      "Malformed initialization",
    );
    return {
      type: "initialized",
      version: Number(BigInt(data[0])),
      admin: address(data[1]),
      feeBps: Number(BigInt(data[2])),
      feeRecipient: address(data[3]),
    };
  }
  if (same(tag, sel("TradingChanged"))) {
    requireValue(
      event.keys.length === 1 && data.length === 1,
      "Malformed trading event",
    );
    return { type: "trading_changed", paused: bool(data[0]) };
  }
  if (same(tag, sel("CurrencyPolicyChanged"))) {
    requireValue(
      event.keys.length === 2 && data.length === 1,
      "Malformed currency event",
    );
    return {
      type: "currency_policy",
      address: address(event.keys[1]),
      enabled: bool(data[0]),
    };
  }
  if (same(tag, sel("CollectionPolicyChanged"))) {
    requireValue(
      event.keys.length === 2 && data.length === 2,
      "Malformed collection event",
    );
    return {
      type: "collection_policy",
      address: address(event.keys[1]),
      enabled: bool(data[0]),
      royalties: bool(data[1]),
    };
  }
  return { type: "other" };
}

const accepted = (r) =>
  ["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(r.finality_status);
const rpcCode = (e) => e?.details?.rpcCode ?? e?.code;
export function newState(plan) {
  return { schemaVersion: 1, planId: plan.planId, steps: {}, history: [] };
}
export function checkState(plan, state) {
  requireValue(
    state?.schemaVersion === 1 &&
      state.planId === plan.planId &&
      state.steps &&
      Array.isArray(state.history),
    "Journal belongs to another plan or is invalid",
  );
  return state;
}
const configAt = (rpc, plan, block) =>
  rpc.contract(plan.address, sel("get_config"), [], block);
function checkConfig(values, plan, paused) {
  requireValue(
    values.length === 5 &&
      BigInt(values[0]) === 1n &&
      same(values[1], plan.config.administrator) &&
      BigInt(values[2]) === BigInt(paused ? 1 : 0) &&
      BigInt(values[3]) === BigInt(plan.config.feeBps) &&
      same(values[4], plan.config.feeRecipient),
    "On-chain administrator, fee, version or pause state differs from plan",
  );
}
async function classAt(rpc, at, block = "latest") {
  return rpc.call("starknet_getClassHashAt", {
    contract_address: at,
    block_id: block,
  });
}
export async function assertIdentity(rpc, plan) {
  checkPlan(plan);
  requireValue(
    same(await rpc.call("starknet_chainId", []), plan.chainId),
    "Wrong Starknet network",
  );
  const cfg = plan.config;
  for (const [at, expected] of [
    [cfg.udc.address, cfg.udc.classHash],
    [cfg.deployer, cfg.deployerClassHash],
    [cfg.administrator, cfg.administratorClassHash],
    ...cfg.collections.map((a) => [a.address, a.classHash]),
    ...cfg.currencies.map((a) => [a.address, a.classHash]),
  ])
    requireValue(
      same(await classAt(rpc, at), expected),
      `Contract class changed at ${at}`,
    );
}
async function assertAssets(rpc, plan) {
  for (const asset of plan.config.collections) {
    const erc721 = await rpc.contract(
      asset.address,
      sel("supports_interface"),
      ["0x33eb2f84c309543403fd69f0d0f363781ef06ef6faeb0131ff16ea3175bd943"],
    );
    const royalty = await rpc.contract(
      asset.address,
      sel("supports_interface"),
      ["0x2d3414e45a8700c29f119a54b9f11dca0e29e06ddcb214018fc37340e165ed6"],
    );
    requireValue(
      erc721.length === 1 && BigInt(erc721[0]) === 1n,
      "Collection does not report ERC721",
    );
    requireValue(
      royalty.length === 1 &&
        BigInt(royalty[0]) === BigInt(asset.royalties ? 1 : 0),
      "Royalty support differs from reviewed plan",
    );
  }
}
async function canonicalReceipt(rpc, txHash) {
  const receipt = await rpc.call("starknet_getTransactionReceipt", {
    transaction_hash: txHash,
  });
  requireValue(
    receipt.transaction_hash && same(receipt.transaction_hash, txHash),
    "Receipt hash mismatch",
  );
  requireValue(
    accepted(receipt) &&
      Number.isSafeInteger(receipt.block_number) &&
      receipt.block_hash,
    "Transaction has no accepted block yet; confirm again, do not resend",
  );
  const block = await rpc.call("starknet_getBlockWithTxHashes", {
    block_id: { block_number: receipt.block_number },
  });
  requireValue(
    same(block.block_hash, receipt.block_hash) &&
      block.transactions.some((h) => same(h, txHash)),
    "Receipt is not canonical",
  );
  return receipt;
}
function marketEvents(receipt, plan) {
  return (receipt.events ?? [])
    .filter((e) => same(e.from_address, plan.address))
    .map((e) =>
      decodeEvent(e, { chain: plan.config.network, marketplace: plan.address }),
    );
}
export async function verifyReceipt(rpc, plan, step, txHash) {
  const receipt = await canonicalReceipt(rpc, txHash);
  requireValue(
    receipt.execution_status === "SUCCEEDED",
    "Transaction reverted; inspect it before retrying",
  );
  const tx = await rpc.call("starknet_getTransactionByHash", {
    transaction_hash: txHash,
  });
  requireValue(
    same(tx.sender_address, plan.steps[step].sender),
    "Transaction sender differs from planned authority",
  );
  requireValue(
    BigInt(tx.version) === 3n && BigInt(tx.tip ?? 0) === 0n,
    "Only reviewed V3 transactions with zero tip are supported",
  );
  requireValue(
    maximumFee(tx.resource_bounds) <= BigInt(plan.config.maxFeeFri),
    "Receipt transaction exceeds the reviewed fee cap",
  );
  if (step === "declare") {
    requireValue(
      tx.type === "DECLARE" &&
        same(tx.class_hash, plan.artifacts.classHash) &&
        same(tx.compiled_class_hash, plan.artifacts.compiledClassHash),
      "Declaration does not match reviewed artifacts",
    );
  } else {
    const expectedCalls = transaction.getExecuteCalldata(
      plan.steps[step].calls,
      "1",
    );
    requireValue(
      Array.isArray(tx.calldata) &&
        tx.calldata.length === expectedCalls.length &&
        tx.calldata.every((value, index) => same(value, expectedCalls[index])),
      "Transaction calldata differs from reviewed Cairo 1 account multicall",
    );
    requireValue(
      same(
        await classAt(rpc, plan.address, { block_hash: receipt.block_hash }),
        plan.artifacts.classHash,
      ),
      "Deployment class mismatch",
    );
    const events = marketEvents(receipt, plan);
    if (step === "deploy") {
      requireValue(
        events.length === 1 && events[0].type === "initialized",
        "Missing or unexpected deployment events",
      );
      const e = events[0];
      requireValue(
        e.version === 1 &&
          same(e.admin, plan.config.administrator) &&
          e.feeBps === plan.config.feeBps &&
          same(e.feeRecipient, plan.config.feeRecipient),
        "Initialization terms mismatch",
      );
    } else if (step === "configure") {
      const expected = [
        { type: "trading_changed", paused: true },
        ...plan.config.currencies.map((a) => ({
          type: "currency_policy",
          address: address(a.address),
          enabled: true,
        })),
        ...plan.config.collections.map((a) => ({
          type: "collection_policy",
          address: address(a.address),
          enabled: true,
          royalties: a.royalties,
        })),
      ];
      // Decoder uses padded addresses; normalize both sides before comparison.
      const normalize = (e) => ({
        ...e,
        ...(e.address ? { address: address(e.address) } : {}),
      });
      requireValue(
        digest(events.map(normalize)) === digest(expected),
        "Configuration receipt differs from reviewed calls",
      );
    } else {
      requireValue(
        events.length === 1 &&
          events[0].type === "trading_changed" &&
          events[0].paused === false,
        "Activation receipt mismatch",
      );
    }
    await configAt(rpc, plan, { block_hash: receipt.block_hash }).then((v) =>
      checkConfig(v, plan, step === "configure"),
    );
  }
  return {
    status: "confirmed",
    hash: felt(txHash),
    blockNumber: receipt.block_number,
    blockHash: receipt.block_hash,
  };
}
function priorSteps(state, step) {
  for (const prior of STEPS.slice(0, STEPS.indexOf(step)))
    requireValue(
      state.steps[prior]?.status === "confirmed",
      `Confirm ${prior} first`,
    );
}
export async function confirmStep({
  plan,
  step,
  rpc,
  journal,
  hash: providedHash,
  activation,
}) {
  requireValue(STEPS.includes(step), "Unknown step");
  const evidence = activation
    ? activationEvidence(plan, activation)
    : undefined;
  await assertIdentity(rpc, plan);
  const state = checkState(plan, await journal.read());
  priorSteps(state, step);
  if (step === "declare" && state.steps.declare?.alreadyDeclared) {
    await rpc.call("starknet_getClass", {
      class_hash: plan.artifacts.classHash,
      block_id: "latest",
    });
    return state.steps.declare;
  }
  const txHash = providedHash ?? state.steps[step]?.hash;
  requireValue(
    txHash,
    "No hash recorded: provide the known transaction hash; never blindly resubmit",
  );
  if (state.steps[step]?.hash)
    requireValue(
      same(state.steps[step].hash, txHash),
      "Journal already records a different hash",
    );
  const transaction = await rpc.call("starknet_getTransactionByHash", {
    transaction_hash: felt(txHash),
  });
  requireValue(
    same(transaction.sender_address, plan.steps[step].sender),
    "Recovery transaction sender mismatch",
  );
  if (state.steps[step]?.nonce != null)
    requireValue(
      same(transaction.nonce, state.steps[step].nonce),
      "Recovery transaction nonce mismatch",
    );
  state.steps[step] = {
    ...state.steps[step],
    status: "submitted",
    hash: felt(txHash),
  };
  await journal.write(state); // Preserve a reconciled hash even when receipt is pending/reverted.
  const verified = await verifyReceipt(rpc, plan, step, felt(txHash));
  state.steps[step] = {
    ...state.steps[step],
    ...verified,
    ...(step === "activate" && evidence
      ? { activationEvidence: evidence }
      : {}),
  };
  await journal.write(state);
  return verified;
}
export async function sendStep({
  plan,
  step,
  rpc,
  journal,
  signer,
  approve,
  clean = true,
  activation,
}) {
  requireValue(STEPS.includes(step), "Unknown step");
  checkPlan(plan);
  requireValue(
    approve === plan.planId,
    "Broadcast requires the exact reviewed --approve plan digest",
  );
  const evidence = activation
    ? activationEvidence(plan, activation)
    : undefined;
  const blockers = mainnetBlockers(plan, step, evidence);
  requireValue(
    !blockers.length,
    `Missing mainnet release evidence: ${blockers.join(", ")}`,
  );
  if (plan.config.network === "SN_MAIN")
    requireValue(
      clean,
      "Commit the reviewed mainnet release before broadcasting",
    );
  await assertIdentity(rpc, plan);
  const state = checkState(plan, await journal.read());
  priorSteps(state, step);
  const existing = state.steps[step];
  if (existing?.status === "confirmed") return existing;
  requireValue(
    !existing,
    "Submission already recorded. Confirm/reconcile its hash; a timeout never authorizes a resend",
  );
  if (step === "declare") {
    try {
      await rpc.call("starknet_getClass", {
        class_hash: plan.artifacts.classHash,
        block_id: "latest",
      });
      state.steps.declare = { status: "confirmed", alreadyDeclared: true };
      await journal.write(state);
      return state.steps.declare;
    } catch (e) {
      if (rpcCode(e) !== 28) throw e;
    }
  } else if (step === "deploy") {
    let exists = false;
    try {
      await classAt(rpc, plan.address);
      exists = true;
    } catch (e) {
      if (rpcCode(e) !== 20) throw e;
    }
    requireValue(
      !exists,
      "Predicted address already exists: record its deployment hash and verify, do not redeploy",
    );
  } else {
    await assertAssets(rpc, plan);
    requireValue(
      same(await classAt(rpc, plan.address), plan.artifacts.classHash),
      "Marketplace class changed",
    );
    await configAt(rpc, plan, "latest").then((v) =>
      checkConfig(v, plan, step === "activate"),
    );
    if (step === "activate") await verifyLive(rpc, plan, state, true);
  }
  requireValue(
    signer && same(signer.address, plan.steps[step].sender),
    "Signer does not match the planned authority; use exported calls for a multisig",
  );
  const nonce = await rpc.call("starknet_getNonce", {
    contract_address: signer.address,
    block_id: "pre_confirmed",
  });
  const bounds = await signer.estimate(step, plan, nonce);
  const maximum = maximumFee(bounds);
  requireValue(
    maximum <= BigInt(plan.config.maxFeeFri),
    "Estimated resource-bound fee exceeds maxFeeFri",
  );
  await assertIdentity(rpc, plan);
  state.steps[step] = {
    status: "submitting",
    nonce: String(nonce),
    maximumFeeFri: maximum.toString(),
    ...(step === "activate" && evidence
      ? { activationEvidence: evidence }
      : {}),
  };
  await journal.write(state); // Durable submission intent precedes the broadcast attempt.
  const response = await signer.send(step, plan, {
    nonce,
    resourceBounds: bounds,
    tip: 0n,
  });
  const txHash = felt(response.transaction_hash, "transaction hash");
  state.steps[step] = {
    ...state.steps[step],
    status: "submitted",
    hash: txHash,
  };
  await journal.write(state);
  return state.steps[step];
}
export async function resetReverted({ plan, step, rpc, journal }) {
  await assertIdentity(rpc, plan);
  const state = checkState(plan, await journal.read());
  const previous = state.steps[step];
  requireValue(previous?.hash, "Reconcile a known hash first");
  const receipt = await canonicalReceipt(rpc, previous.hash);
  requireValue(
    receipt.execution_status === "REVERTED",
    "Only a canonically reverted transaction may be reset",
  );
  requireValue(
    !STEPS.slice(STEPS.indexOf(step) + 1).some((s) => state.steps[s]),
    "Later steps exist",
  );
  state.history.push({ step, ...previous, result: "reverted" });
  delete state.steps[step];
  await journal.write(state);
}
export async function verifyLive(
  rpc,
  plan,
  state,
  paused = state.steps.activate?.status !== "confirmed",
) {
  await assertIdentity(rpc, plan);
  await assertAssets(rpc, plan);
  requireValue(
    state.steps.deploy?.status === "confirmed" &&
      state.steps.configure?.status === "confirmed",
    "Deployment and configuration receipts must be confirmed",
  );
  for (const step of [
    "deploy",
    "configure",
    ...(state.steps.activate?.status === "confirmed" ? ["activate"] : []),
  ])
    await verifyReceipt(rpc, plan, step, state.steps[step].hash);
  const head = await rpc.call("starknet_getBlockWithTxHashes", {
    block_id: "latest",
  });
  requireValue(
    head.block_hash && Number.isSafeInteger(head.block_number),
    "Accepted head required",
  );
  const block = { block_hash: head.block_hash };
  await configAt(rpc, plan, block).then((v) => checkConfig(v, plan, paused));
  const policies = { collection_policy: new Map(), currency_policy: new Map() };
  let token;
  const seen = new Set();
  for (let page = 0; page < 1000; page++) {
    const response = await rpc.call("starknet_getEvents", {
      filter: {
        from_block: { block_number: state.steps.deploy.blockNumber },
        to_block: block,
        address: plan.address,
        keys: [],
        chunk_size: 100,
        ...(token ? { continuation_token: token } : {}),
      },
    });
    for (const event of response.events) {
      requireValue(
        same(event.from_address, plan.address),
        "Unexpected event source",
      );
      const decoded = decodeEvent(event, {
        chain: plan.config.network,
        marketplace: plan.address,
      });
      if (policies[decoded.type])
        policies[decoded.type].set(address(decoded.address), decoded);
    }
    if (!response.continuation_token) {
      token = undefined;
      break;
    }
    requireValue(
      !seen.has(response.continuation_token),
      "Repeated event continuation token",
    );
    seen.add(response.continuation_token);
    token = response.continuation_token;
  }
  requireValue(
    !token,
    "Event scan exceeds safety bound; use a dedicated reconciliation process",
  );
  for (const [name, assets] of [
    ["collection_policy", plan.config.collections],
    ["currency_policy", plan.config.currencies],
  ]) {
    const actual = policies[name];
    for (const a of assets) {
      const p = actual.get(a.address);
      requireValue(
        p?.enabled === true &&
          (name !== "collection_policy" || p.royalties === a.royalties),
        "Current asset policy differs from plan",
      );
    }
    for (const [a, p] of actual)
      requireValue(
        !p.enabled || assets.some((x) => x.address === a),
        "Unexpected asset enabled after configuration",
      );
  }
  return {
    address: plan.address,
    paused,
    verifiedBlock: head.block_number,
    verifiedBlockHash: head.block_hash,
  };
}
export function handoff(plan, state, verified) {
  const c = plan.config;
  const registry = {
    schemaVersion: 1,
    chains: {
      [c.network]: {
        chainId: plan.chainId,
        marketplace: plan.address,
        marketplaceClassHash: plan.artifacts.classHash,
        marketplaceStartBlock: state.steps.deploy.blockNumber,
        collections: c.collections.map((a) => ({
          address: a.address,
          name: a.name,
          standard: "ERC721",
          startBlock: a.startBlock,
          classHash: a.classHash,
          metadata: { enabled: true },
        })),
        currencies: c.currencies.map((a) => ({
          address: a.address,
          symbol: a.symbol,
          decimals: a.decimals,
          classHash: a.classHash,
        })),
      },
    },
  };
  return {
    registry,
    record: {
      schemaVersion: 1,
      planId: plan.planId,
      gitCommit: plan.gitCommit,
      network: c.network,
      ...plan.artifacts,
      ...verified,
      administrator: c.administrator,
      feeBps: c.feeBps,
      feeRecipient: c.feeRecipient,
      transactions: state.steps,
      releaseEvidence: c.release,
      activationEvidence: state.steps.activate?.activationEvidence ?? null,
    },
    frontend: `NEXT_PUBLIC_MARKETPLACE_CHAIN_ID=${c.network}\nNEXT_PUBLIC_MARKETPLACE_ADDRESS=${plan.address}\nMARKETPLACE_API_URL=\nNEXT_PUBLIC_SITE_URL=\n`,
    backend: `MARKETPLACE_CHAIN=${c.network}\nMARKETPLACE_ADDRESS=${plan.address}\nMARKETPLACE_CLASS_HASH=${plan.artifacts.classHash}\nMARKETPLACE_START_BLOCK=${state.steps.deploy.blockNumber}\nMARKETPLACE_REGISTRY_PATH=\nMARKETPLACE_RPC_URL=\nMARKETPLACE_RPC_FALLBACK_URL=\nMARKETPLACE_ORIGIN=\nMARKETPLACE_OPERATOR_TOKEN=\nMARKETPLACE_INDEXER_ENABLED=false\nMARKETPLACE_API_WORKERS=1\n`,
  };
}
