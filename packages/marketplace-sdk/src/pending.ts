export const PENDING_TRANSACTION_KEY = "biblio-pending-transaction";
export type PendingTransaction = {
  hash: string;
  account: string;
  chain: string;
  marketplace: string;
  stage: "submitted" | "accepted";
  mode?: "trade" | "cancel" | "admin";
};
export function readPending(
  raw: string | null,
  account: string,
  chain: string,
  marketplace: string,
): PendingTransaction | null {
  try {
    const value = JSON.parse(raw ?? "null") as PendingTransaction | null;
    if (
      !value ||
      !/^0x[\da-f]+$/i.test(value.hash) ||
      !["submitted", "accepted"].includes(value.stage) ||
      value.chain !== chain ||
      BigInt(value.account) !== BigInt(account) ||
      BigInt(value.marketplace) !== BigInt(marketplace)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function receiptOutcome(
  receipt: unknown,
): "pending" | "reverted" | "accepted" {
  if (!receipt || typeof receipt !== "object") return "pending";
  const r = receipt as { execution_status?: string; finality_status?: string };
  if (!["ACCEPTED_ON_L1", "ACCEPTED_ON_L2"].includes(r.finality_status ?? ""))
    return "pending";
  return r.execution_status === "REVERTED"
    ? "reverted"
    : r.execution_status === "SUCCEEDED"
      ? "accepted"
      : "pending";
}
