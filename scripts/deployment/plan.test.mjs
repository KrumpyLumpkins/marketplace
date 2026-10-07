import { describe, expect, it } from "vitest";
import { buildPlan, checkPlan, maximumFee, mainnetBlockers } from "./plan.mjs";
import { artifacts, input } from "./fixtures.mjs";
describe("deployment plans", () => {
  it("pins deterministic deployment and keeps activation separate", () => {
    const p = buildPlan(input(), artifacts, "abc");
    expect(buildPlan(input(), artifacts, "abc")).toEqual(p);
    expect(p.steps.configure.calls[0]).toMatchObject({
      entrypoint: "set_paused",
      calldata: ["1"],
    });
    expect(p.steps.activate.calls).toEqual([
      { contractAddress: p.address, entrypoint: "set_paused", calldata: ["0"] },
    ]);
    expect(p.config.administrator).toBe("0x2");
  });
  it("rejects unsafe economic values, duplicate assets and omitted identities", () => {
    for (const change of [
      { feeBps: 501 },
      { feeBps: NaN },
      { administrator: "0x0" },
      { salt: "" },
      { maxFeeFri: "0" },
      { collections: [...input().collections, ...input().collections] },
    ])
      expect(() =>
        buildPlan({ ...input(), ...change }, artifacts, "abc"),
      ).toThrow();
  });
  it("does not let a changed plan reuse approval", () => {
    const p = buildPlan(input(), artifacts, "abc");
    p.steps.configure.calls[0].calldata = ["0"];
    expect(() => checkPlan(p)).toThrow();
  });
  it("reports missing mainnet evidence instead of inventing approval", () => {
    const p = buildPlan({ ...input(), network: "SN_MAIN" }, artifacts, "abc");
    expect(mainnetBlockers(p, "deploy")).toContain("contractAudit");
    expect(mainnetBlockers(p, "activate")).toContain("indexerReconciliation");
  });
  it("calculates a hard resource-bound ceiling using bigint", () => {
    const bounds = {
      l1_gas: { max_amount: "2", max_price_per_unit: "3" },
      l1_data_gas: { max_amount: "4", max_price_per_unit: "5" },
      l2_gas: { max_amount: "6", max_price_per_unit: "7" },
    };
    expect(maximumFee(bounds)).toBe(68n);
    expect(() => maximumFee({ ...bounds, l2_gas: undefined })).toThrow();
  });
});

it("accepts later activation evidence only when bound to the original plan", () => {
  const config = {
    ...input(),
    network: "SN_MAIN",
    release: {
      contractAudit: "audit",
      assetCompatibility: "matrix",
      sepoliaRehearsal: "rehearsal",
      releaseApproval: "release",
    },
  };
  const plan = buildPlan(config, artifacts, "abc");
  expect(mainnetBlockers(plan, "deploy")).toEqual([]);
  const evidence = {
    planId: plan.planId,
    indexerReconciliation: "checkpoint",
    walletSmoke: "wallet-test",
    activationApproval: "multisig-review",
  };
  expect(mainnetBlockers(plan, "activate", evidence)).toEqual([]);
  expect(
    mainnetBlockers(plan, "activate", { ...evidence, planId: "other" }),
  ).toContain("activationPlanId");
  expect(buildPlan(config, artifacts, "abc").planId).toBe(plan.planId);
});
