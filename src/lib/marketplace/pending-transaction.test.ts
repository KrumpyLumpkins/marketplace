import { expect, it } from "vitest";
import { readPending, receiptOutcome } from "./pending-transaction";
it("ignores a corrupt or foreign deployment record", () => {
  expect(readPending("{", "0x1", "LOCAL", "0x9")).toBeNull();
  expect(
    readPending(
      JSON.stringify({
        hash: "0xaa",
        account: "0x1",
        chain: "LOCAL",
        marketplace: "0x8",
        stage: "submitted",
      }),
      "0x1",
      "LOCAL",
      "0x9",
    ),
  ).toBeNull();
});
it("recovers submitted transactions after reload with normalized account identity", () => {
  expect(
    readPending(
      JSON.stringify({
        hash: "0xaa",
        account: "0x01",
        chain: "LOCAL",
        marketplace: "0x09",
        stage: "submitted",
      }),
      "0x1",
      "LOCAL",
      "0x9",
    )?.hash,
  ).toBe("0xaa");
});
it("does not call a preconfirmed receipt accepted", () => {
  expect(
    receiptOutcome({
      execution_status: "SUCCEEDED",
      finality_status: "PRE_CONFIRMED",
    }),
  ).toBe("pending");
  expect(
    receiptOutcome({
      execution_status: "REVERTED",
      finality_status: "ACCEPTED_ON_L2",
    }),
  ).toBe("reverted");
  expect(
    receiptOutcome({
      execution_status: "SUCCEEDED",
      finality_status: "ACCEPTED_ON_L2",
    }),
  ).toBe("accepted");
});
