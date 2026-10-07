import type { AccountCall } from "./protocol.js";
import type { MarketConfig } from "./types.js";
import type { Requester } from "./client.js";
import {
  readPending,
  receiptOutcome,
  type PendingTransaction,
} from "./pending.js";
export type TradeState = {
  stage:
    | "idle"
    | "checking"
    | "signature"
    | "submitted"
    | "accepted"
    | "indexing"
    | "reflected"
    | "reverted"
    | "error";
  message: string;
  hash?: string;
  unknownSubmission?: boolean;
};
export type AccountAdapter = {
  address: string;
  getChainId: () => Promise<string | bigint>;
  execute: (calls: AccountCall[]) => Promise<{ transaction_hash: string }>;
  waitForTransaction: (
    hash: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  getTransactionReceipt: (hash: string) => Promise<unknown>;
};
export type PendingStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
export type TradeContext = {
  account?: AccountAdapter;
  config?: Pick<MarketConfig, "chain" | "chainId" | "marketplace" | "demo"> & {
    status: Pick<MarketConfig["status"], "safeForCheckout">;
  };
  expectedMarketplace?: string;
  storage?: PendingStorage;
};
export function pendingStorageKey(
  account: string,
  chain: string,
  marketplace: string,
) {
  return `biblio-pending-transaction:${chain}:${BigInt(marketplace)}:${BigInt(account)}`;
}
export function createMemoryStorage(): PendingStorage {
  const values = new Map<string, string>();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      values.delete(k);
    },
  };
}
export class TransactionCoordinator {
  private snapshot: { state: TradeState; busy: boolean } = {
    state: { stage: "idle", message: "" },
    busy: false,
  };
  private listeners = new Set<() => void>();
  private memory = createMemoryStorage();
  constructor(
    private deps: {
      request: Requester;
      invalidate?: () => Promise<unknown>;
      sleep?: (ms: number) => Promise<void>;
      pollAttempts?: number;
    },
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(state: TradeState, busy = false) {
    this.snapshot = { state, busy };
    for (const listener of this.listeners) listener();
  }
  private key(c: TradeContext) {
    return pendingStorageKey(
      c.account!.address,
      c.config!.chain,
      c.config!.marketplace!,
    );
  }
  private load(
    c: TradeContext,
  ): (PendingTransaction & { unknown?: boolean }) | null {
    const raw =
      this.memory.getItem(this.key(c)) ??
      c.storage?.getItem(this.key(c)) ??
      null;
    return readPending(
      raw,
      c.account!.address,
      c.config!.chain,
      c.config!.marketplace!,
    );
  }
  private save(
    c: TradeContext,
    record: PendingTransaction & { unknown?: boolean },
  ) {
    const key = this.key(c),
      value = JSON.stringify(record);
    this.memory.setItem(key, value);
    // Keep in-memory recovery even when browser persistence fails after submission.
    try {
      c.storage?.setItem(key, value);
    } catch {
      /* The retained hash still blocks duplicate submission in this client. */
    }
  }
  private clear(c: TradeContext) {
    this.memory.removeItem(this.key(c));
    try {
      c.storage?.removeItem(this.key(c));
    } catch {
      /* Retaining a durable record is safer than an automatic retry. */
    }
  }
  private async check(c: TradeContext, mode: "trade" | "cancel" | "admin") {
    if (!c.account) throw new Error("Connect your wallet first.");
    const cfg = c.config;
    if (
      !cfg?.marketplace ||
      cfg.demo ||
      (!cfg.status.safeForCheckout && mode === "trade")
    )
      throw new Error(
        cfg?.demo
          ? "Demo data: trading is disabled."
          : "Trading is unavailable while the market is syncing or unconfigured.",
      );
    if (
      !c.expectedMarketplace ||
      BigInt(c.expectedMarketplace) !== BigInt(cfg.marketplace)
    )
      throw new Error(
        "Marketplace deployment is not configured for this frontend.",
      );
    if (BigInt(await c.account.getChainId()) !== BigInt(cfg.chainId))
      throw new Error("Switch your wallet to the marketplace network.");
  }
  async execute(
    getContext: () => TradeContext,
    prepare: (marketplace: string) => Promise<AccountCall[]> | AccountCall[],
    mode: "trade" | "cancel" | "admin" = "trade",
    monitor = true,
  ): Promise<boolean | PendingTransaction> {
    if (this.snapshot.busy) return false;
    this.set(
      { stage: "checking", message: "Checking order terms and approvals…" },
      true,
    );
    let c: TradeContext | undefined;
    try {
      const initial = getContext();
      c = {
        ...initial,
        config: initial.config
          ? { ...initial.config, status: { ...initial.config.status } }
          : undefined,
        account: initial.account
          ? {
              address: initial.account.address,
              getChainId: () => initial.account!.getChainId(),
              execute: (calls) => initial.account!.execute(calls),
              waitForTransaction: (hash, options) =>
                initial.account!.waitForTransaction(hash, options),
              getTransactionReceipt: (hash) =>
                initial.account!.getTransactionReceipt(hash),
            }
          : undefined,
      };
      await this.check(c, mode);
      const saved = this.load(c);
      if (saved) {
        this.set({
          stage: saved.stage,
          message: saved.unknown
            ? "Submission outcome is unknown. Reconcile with your wallet before another submission."
            : "A saved transaction needs a status check before another submission.",
          hash: saved.unknown ? undefined : saved.hash,
          unknownSubmission: !!saved.unknown,
        });
        return false;
      }
      const calls = await prepare(c.config!.marketplace!);
      if (!calls.length) throw new Error("No transaction calls to execute.");
      const current = getContext();
      await this.check(current, mode);
      if (
        !current.account ||
        BigInt(current.account.address) !== BigInt(c.account!.address) ||
        current.config!.chain !== c.config!.chain ||
        BigInt(current.config!.marketplace!) !== BigInt(c.config!.marketplace!)
      )
        throw new Error(
          "Wallet or deployment changed. Review the trade again.",
        );
      this.set(
        {
          stage: "signature",
          message: "Confirm the transaction in your wallet.",
        },
        true,
      );
      const unknown: PendingTransaction & { unknown: boolean } = {
        hash: "0x0",
        account: c.account!.address,
        chain: c.config!.chain,
        marketplace: c.config!.marketplace!,
        stage: "submitted",
        unknown: true,
        mode,
      };
      // Persist intent before signing, so an ambiguous wallet response cannot invite an automatic resubmission.
      if (c.storage) c.storage.setItem(this.key(c), JSON.stringify(unknown));
      this.save(c, unknown);
      let tx: { transaction_hash: string };
      try {
        tx = await current.account.execute(calls);
      } catch (error) {
        const e = error as { code?: number; name?: string; message?: string };
        if (e.code === 4001 || e.name === "UserRejectedRequestError")
          this.clear(c);
        throw error;
      }
      if (!/^0x[\da-f]+$/i.test(tx.transaction_hash))
        throw new Error(
          "Wallet returned an unknown submission outcome. Check wallet activity before retrying.",
        );
      const record: PendingTransaction = {
        ...unknown,
        hash: tx.transaction_hash,
      };
      delete (record as PendingTransaction & { unknown?: boolean }).unknown;
      this.save(c, record);
      this.set(
        {
          stage: "submitted",
          message: "Transaction submitted.",
          hash: record.hash,
        },
        monitor,
      );
      return monitor ? await this.monitor(c, record) : record;
    } catch (error) {
      this.set({
        stage: "error",
        message: error instanceof Error ? error.message : "Transaction failed.",
        unknownSubmission: !!(c?.account && c.config?.marketplace && this.memory.getItem(this.key(c)) && JSON.parse(this.memory.getItem(this.key(c))!).unknown),
      });
      return false;
    }
  }
  private async monitor(
    c: TradeContext,
    record: PendingTransaction,
  ): Promise<boolean> {
    if (!c.account) return false;
    this.set(
      {
        stage: record.stage,
        message: "Checking the submitted transaction…",
        hash: record.hash,
      },
      true,
    );
    try {
      const receipt = await c.account
        .waitForTransaction(record.hash, {
          successStates: ["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"],
          retryInterval: 1000,
          retries: 30,
        })
        .catch(() => c.account!.getTransactionReceipt(record.hash));
      const outcome = receiptOutcome(receipt);
      if (outcome === "reverted") {
        this.clear(c);
        this.set({
          stage: "reverted",
          message:
            "Transaction reverted. No trades completed; review the order before retrying.",
          hash: record.hash,
        });
        return false;
      }
      if (outcome !== "accepted") {
        this.set({
          stage: "submitted",
          message:
            "Transaction is still pending. Check its status before submitting again.",
          hash: record.hash,
        });
        return false;
      }
      const events = (receipt as { events?: Array<{ from_address?: string }> })
        .events;
      const noMarketEvents =
        Array.isArray(events) &&
        events.every((event) => {
          try {
            return (
              typeof event.from_address === "string" &&
              BigInt(event.from_address) !== BigInt(record.marketplace)
            );
          } catch {
            return false;
          }
        });
      if (record.mode === "cancel" && noMarketEvents) {
        this.clear(c);
        await this.deps.invalidate?.();
        this.set({
          stage: "accepted",
          message:
            "Cancellation confirmed on-chain; no new marketplace event was emitted.",
          hash: record.hash,
        });
        return true;
      }
      this.save(c, { ...record, stage: "accepted" });
      this.set(
        {
          stage: "indexing",
          message: "Accepted on-chain. Waiting for marketplace data…",
          hash: record.hash,
        },
        true,
      );
      const block = (receipt as { block_number?: number }).block_number;
      let reflected = false;
      for (let i = 0; i < (this.deps.pollAttempts ?? 30); i++) {
        try {
          if (
            (
              await this.deps.request<{ reflected: boolean }>(
                `/transactions/${record.hash}`,
                { block },
              )
            ).reflected
          ) {
            reflected = true;
            break;
          }
        } catch {
          /* Acceptance survives indexing outages. */
        }
        await (
          this.deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
        )(1000);
      }
      if (reflected || record.mode === "cancel" || record.mode === "admin")
        this.clear(c);
      await this.deps.invalidate?.();
      this.set({
        stage: reflected ? "reflected" : "accepted",
        message: reflected
          ? "Trade confirmed and marketplace updated."
          : "Trade accepted. Indexing is delayed; check status instead of submitting again.",
        hash: record.hash,
      });
      return true;
    } catch {
      this.set({
        stage: record.stage,
        message:
          "Receipt check unavailable. Your transaction is saved; check status before submitting again.",
        hash: record.hash,
      });
      return false;
    }
  }
  async resume(getContext: () => TradeContext) {
    if (this.snapshot.busy) return false;
    this.set(this.snapshot.state, true);
    try {
      const c = getContext();
      if (!c.account || !c.config?.marketplace) {
        this.set({ stage: "error", message: "Connect your wallet first." });
        return false;
      }
      if (BigInt(await c.account.getChainId()) !== BigInt(c.config.chainId))
        throw new Error(
          "Switch to the marketplace network to check this transaction.",
        );
      const record = this.load(c);
      if (!record) {
        this.set({ stage: "idle", message: "" });
        return false;
      }
      if (record.unknown) {
        this.set({ stage: "error", unknownSubmission: true, message: "Submission outcome is unknown. Check your wallet activity to recover this attempt." });
        return false;
      }
      return this.monitor(c, record);
    } catch (e) {
      this.set({
        stage: "error",
        message: e instanceof Error ? e.message : "Recovery failed.",
      });
      return false;
    }
  }
  reconcileUnknown(
    c: TradeContext,
    result: { transactionHash: string } | { confirmedNotSubmitted: true },
  ) {
    if (this.snapshot.busy) throw new Error("Transaction is busy.");
    if (!c.account || !c.config?.marketplace) throw new Error("Connect your wallet first.");
    const pending = this.load(c);
    if (!pending?.unknown)
      throw new Error("No ambiguous submission to reconcile.");
    if ("transactionHash" in result) {
      if (!/^0x[\da-f]+$/i.test(result.transactionHash))
        throw new Error("Invalid transaction hash.");
      this.save(c, {
        ...pending,
        hash: result.transactionHash,
        unknown: false,
      });
    } else if (result.confirmedNotSubmitted === true) this.clear(c);
    else throw new Error("Wallet confirmation is required.");
    this.set({ stage: "idle", message: "" });
  }
}
