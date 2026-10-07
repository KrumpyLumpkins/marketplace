import { describe, expect, it, vi } from "vitest";
import { hash, transaction } from "starknet-devnet-sdk";
import { buildPlan } from "./plan.mjs";
import { artifacts, input } from "./fixtures.mjs";
import { confirmStep, newState, resetReverted, sendStep } from "./runner.mjs";
const bounds = {
  l1_gas: { max_amount: 1n, max_price_per_unit: 1n },
  l1_data_gas: { max_amount: 1n, max_price_per_unit: 1n },
  l2_gas: { max_amount: 1n, max_price_per_unit: 1n },
};
function setup() {
  const plan = buildPlan(input(), artifacts, "abc");
  let state = newState(plan);
  const classes = new Map([
    ["0x1", "0x11"],
    ["0x2", "0x22"],
    ["0x5", "0x55"],
    ["0x6", "0x66"],
    ["0x7", "0x77"],
    [plan.address, artifacts.classHash],
  ]);
  const tx = {
    type: "INVOKE",
    sender_address: "0x1",
    nonce: "0x0",
    version: "0x3",
    tip: "0x0",
    resource_bounds: bounds,
    calldata: transaction.getExecuteCalldata(plan.steps.deploy.calls, "1"),
  };
  const receipt = {
    transaction_hash: "0xab",
    execution_status: "SUCCEEDED",
    finality_status: "ACCEPTED_ON_L2",
    block_number: 10,
    block_hash: "0x10",
    events: [
      {
        from_address: plan.address,
        keys: [hash.getSelectorFromName("MarketplaceInitialized")],
        data: ["1", "2", "200", "3"],
      },
    ],
  };
  const rpc = {
    call: vi.fn(async (method, params) => {
      if (method === "starknet_chainId") return plan.chainId;
      if (method === "starknet_getClassHashAt")
        return classes.get(params.contract_address);
      if (method === "starknet_getClass")
        throw Object.assign(new Error("missing"), { details: { rpcCode: 28 } });
      if (method === "starknet_getNonce") return "0x0";
      if (method === "starknet_getTransactionByHash") return tx;
      if (method === "starknet_getTransactionReceipt") return receipt;
      if (method === "starknet_getBlockWithTxHashes")
        return { block_hash: "0x10", transactions: ["0xab"] };
      throw new Error(method);
    }),
    contract: vi.fn(async () => ["1", "2", "0", "200", "3"]),
  };
  const journal = {
    read: vi.fn(async () => structuredClone(state)),
    write: vi.fn(async (value) => {
      state = structuredClone(value);
    }),
  };
  const signer = {
    address: "0x1",
    estimate: vi.fn(async () => bounds),
    send: vi.fn(async () => ({ transaction_hash: "0xab" })),
  };
  return {
    plan,
    rpc,
    journal,
    signer,
    classes,
    receipt,
    tx,
    getState: () => state,
    setState: (s) => {
      state = s;
    },
    args: () => ({
      plan,
      step: "declare",
      rpc,
      journal,
      signer,
      approve: plan.planId,
    }),
  };
}
describe("deployment execution safety", () => {
  it("requires exact plan approval before any RPC/signature", async () => {
    const x = setup();
    await expect(sendStep({ ...x.args(), approve: "wrong" })).rejects.toThrow(
      "digest",
    );
    expect(x.rpc.call).not.toHaveBeenCalled();
    expect(x.signer.send).not.toHaveBeenCalled();
  });
  it("rejects wrong chain and changed assets before signing", async () => {
    const x = setup();
    x.rpc.call.mockImplementationOnce(async () => "0x1");
    await expect(sendStep(x.args())).rejects.toThrow("network");
    x.classes.set("0x6", "0x99");
    await expect(sendStep(x.args())).rejects.toThrow("class changed");
    expect(x.signer.send).not.toHaveBeenCalled();
  });
  it("requires mainnet release references and a committed checkout", async () => {
    const x = setup();
    x.plan = buildPlan({ ...input(), network: "SN_MAIN" }, artifacts, "abc");
    await expect(
      sendStep({ ...x.args(), plan: x.plan, approve: x.plan.planId }),
    ).rejects.toThrow("contractAudit");
    expect(x.signer.send).not.toHaveBeenCalled();
  });
  it("rejects a fee ceiling violation without persisting intent", async () => {
    const x = setup();
    x.signer.estimate.mockResolvedValue({
      ...bounds,
      l2_gas: { max_amount: 1000001n, max_price_per_unit: 1n },
    });
    await expect(sendStep(x.args())).rejects.toThrow("maxFeeFri");
    expect(x.signer.send).not.toHaveBeenCalled();
    expect(x.journal.write).not.toHaveBeenCalled();
  });
  it("will not broadcast if intent cannot be persisted", async () => {
    const x = setup();
    x.journal.write.mockRejectedValue(new Error("disk full"));
    await expect(sendStep(x.args())).rejects.toThrow("disk full");
    expect(x.signer.send).not.toHaveBeenCalled();
  });
  it("persists ambiguous submission and never automatically sends it again", async () => {
    const x = setup();
    x.signer.send.mockRejectedValue(new Error("connection lost"));
    await expect(sendStep(x.args())).rejects.toThrow("connection lost");
    expect(x.getState().steps.declare.status).toBe("submitting");
    await expect(sendStep(x.args())).rejects.toThrow("Submission already");
    expect(x.signer.send).toHaveBeenCalledTimes(1);
  });
  it("records a returned hash with the reviewed fee bounds and nonce", async () => {
    const x = setup();
    await sendStep(x.args());
    expect(x.getState().steps.declare).toMatchObject({
      status: "submitted",
      hash: "0xab",
      nonce: "0x0",
      maximumFeeFri: "3",
    });
    expect(x.signer.send).toHaveBeenCalledWith("declare", x.plan, {
      nonce: "0x0",
      resourceBounds: bounds,
      tip: 0n,
    });
  });
  it("verifies initialization and records its accepted block", async () => {
    const x = setup();
    x.setState({
      ...newState(x.plan),
      steps: { declare: { status: "confirmed", alreadyDeclared: true } },
    });
    const result = await confirmStep({
      ...x.args(),
      step: "deploy",
      hash: "0xab",
    });
    expect(result).toMatchObject({
      status: "confirmed",
      blockNumber: 10,
      blockHash: "0x10",
    });
  });
  it("rejects wrong sender, nonce and initializer rather than blessing a hash", async () => {
    const x = setup();
    x.setState({
      ...newState(x.plan),
      steps: {
        declare: { status: "confirmed" },
        deploy: { status: "submitting", nonce: "0x5" },
      },
    });
    x.tx.nonce = "0x6";
    await expect(
      confirmStep({ ...x.args(), step: "deploy", hash: "0xab" }),
    ).rejects.toThrow("nonce mismatch");
    x.tx.nonce = "0x5";
    x.receipt.events[0].data[3] = "99";
    await expect(
      confirmStep({ ...x.args(), step: "deploy", hash: "0xab" }),
    ).rejects.toThrow("Initialization");
    expect(x.getState().steps.deploy.status).toBe("submitted");
  });
  it("retains a reconciled reverted hash until explicitly reset", async () => {
    const x = setup();
    x.setState({
      ...newState(x.plan),
      steps: {
        declare: { status: "confirmed" },
        deploy: { status: "submitting", nonce: "0x0" },
      },
    });
    x.receipt.execution_status = "REVERTED";
    await expect(
      confirmStep({ ...x.args(), step: "deploy", hash: "0xab" }),
    ).rejects.toThrow("reverted");
    expect(x.getState().steps.deploy.hash).toBe("0xab");
    await resetReverted({ ...x.args(), step: "deploy" });
    expect(x.getState().steps.deploy).toBeUndefined();
    expect(x.getState().history[0].result).toBe("reverted");
  });
  it("will not reset a successful receipt or confirm an orphaned block", async () => {
    const x = setup();
    x.setState({
      ...newState(x.plan),
      steps: {
        declare: { status: "confirmed" },
        deploy: { status: "submitted", hash: "0xab" },
      },
    });
    await expect(
      resetReverted({ ...x.args(), step: "deploy" }),
    ).rejects.toThrow("Only a canonically reverted");
    x.receipt.block_hash = "0x99";
    await expect(confirmStep({ ...x.args(), step: "deploy" })).rejects.toThrow(
      "canonical",
    );
  });
});

it("blocks mainnet writes from a dirty checkout even with evidence references", async () => {
  const x = setup();
  const plan = buildPlan(
    {
      ...input(),
      network: "SN_MAIN",
      release: {
        contractAudit: "audit",
        assetCompatibility: "assets",
        sepoliaRehearsal: "rehearsal",
        releaseApproval: "approval",
      },
    },
    artifacts,
    "abc",
  );
  await expect(
    sendStep({ ...x.args(), plan, approve: plan.planId, clean: false }),
  ).rejects.toThrow("Commit the reviewed");
  expect(x.signer.send).not.toHaveBeenCalled();
});
it("does not treat an RPC outage as an undeclared class", async () => {
  const x = setup();
  const original = x.rpc.call.getMockImplementation();
  x.rpc.call.mockImplementation(async (method, params) => {
    if (method === "starknet_getClass") throw new Error("RPC offline");
    return original(method, params);
  });
  await expect(sendStep(x.args())).rejects.toThrow("RPC offline");
  expect(x.signer.send).not.toHaveBeenCalled();
  expect(x.journal.write).not.toHaveBeenCalled();
});
it("rejects an externally signed transaction exceeding the plan fee cap", async () => {
  const x = setup();
  x.setState({
    ...newState(x.plan),
    steps: { declare: { status: "confirmed" } },
  });
  x.tx.resource_bounds = {
    ...bounds,
    l2_gas: { max_amount: 1000001n, max_price_per_unit: 1n },
  };
  await expect(
    confirmStep({ ...x.args(), step: "deploy", hash: "0xab" }),
  ).rejects.toThrow("fee cap");
  expect(x.getState().steps.deploy.status).toBe("submitted");
});

it("rejects additional calls hidden in an otherwise matching deployment receipt", async () => {
  const x = setup();
  x.setState({
    ...newState(x.plan),
    steps: { declare: { status: "confirmed" } },
  });
  x.tx.calldata = transaction.getExecuteCalldata(
    [
      ...x.plan.steps.deploy.calls,
      {
        contractAddress: "0x999",
        entrypoint: "transfer",
        calldata: ["1", "2", "0"],
      },
    ],
    "1",
  );
  await expect(
    confirmStep({ ...x.args(), step: "deploy", hash: "0xab" }),
  ).rejects.toThrow("calldata differs");
});
