"use client";
import { useRef, useEffect } from "react";
import { useTransactionState } from "@biblio/marketplace-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@starknet-react/core";
import { getAppMarketplaceClient } from "./app-client";
import { useMarketConfig } from "./react";
import {
  readPending,
  PENDING_TRANSACTION_KEY,
  type AccountCall,
  type TradeContext,
  type PendingStorage,
} from "@biblio/marketplace";
export type { TradeState } from "@biblio/marketplace";
export function useTrade() {
  const { account, address, connector } = useAccount(),
    config = useMarketConfig(),
    client = getAppMarketplaceClient();
  const controller = client.transactions;
  const queries = useQueryClient();
  const snapshot = useTransactionState(controller);
  const current = useRef<TradeContext>({});
  const storage: PendingStorage = {
    getItem(key) {
      const scoped = localStorage.getItem(key);
      if (scoped) return scoped;
      const cfg = config.data;
      if (!address || !cfg?.marketplace) return null;
      const old = readPending(
        localStorage.getItem(PENDING_TRANSACTION_KEY),
        address,
        cfg.chain,
        cfg.marketplace,
      );
      if (old) {
        localStorage.setItem(key, JSON.stringify(old));
        localStorage.removeItem(PENDING_TRANSACTION_KEY);
        return JSON.stringify(old);
      }
      return null;
    },
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  };
  useEffect(() => {
    current.current = {
      config: config.data,
      expectedMarketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS,
      storage,
      account:
        account && address
          ? {
              address,
              getChainId: async () =>
                connector ? connector.chainId() : account.getChainId(),
              execute: (calls) => account.execute(calls),
              waitForTransaction: (hash, options) =>
                account.waitForTransaction(hash, options),
              getTransactionReceipt: (hash) =>
                account.getTransactionReceipt(hash),
            }
          : undefined,
    };
  });
  const recoveryContext = (): TradeContext => ({
    ...current.current,
    config: current.current.config ?? { chain: client.options.chain, chainId: client.options.chainId, marketplace: client.options.expectedMarketplace ?? null, demo: false, status: { safeForCheckout: false } },
  });
  return {
    reconcileUnknown: async (result: { transactionHash: string } | { confirmedNotSubmitted: true }) => {
      const context = recoveryContext();
      if (!context.account || !context.config?.marketplace || !account) throw new Error("Connect your wallet first.");
      const identity = `${context.config.chain}:${BigInt(context.config.marketplace)}:${BigInt(context.account.address)}`;
      const assertCurrent = async () => {
        if (BigInt(await context.account!.getChainId()) !== BigInt(context.config!.chainId))
          throw new Error("Switch to the marketplace network before recovery.");
        const now = recoveryContext();
        if (!now.account || !now.config?.marketplace || `${now.config.chain}:${BigInt(now.config.marketplace)}:${BigInt(now.account.address)}` !== identity)
          throw new Error("Wallet or deployment changed. Check the saved attempt again.");
      };
      await assertCurrent();
      if ('transactionHash' in result) {
        if (!/^0x[\da-f]+$/i.test(result.transactionHash) || BigInt(result.transactionHash) <= 0n || BigInt(result.transactionHash) >= (1n << 251n) + 17n * (1n << 192n) + 1n)
          throw new Error("Enter a valid transaction hash from your wallet.");
        const tx = await account.getTransaction(result.transactionHash);
        if (!('sender_address' in tx) || typeof tx.sender_address !== 'string' || typeof tx.transaction_hash !== 'string' || BigInt(tx.sender_address) !== BigInt(context.account.address) || BigInt(tx.transaction_hash) !== BigInt(result.transactionHash))
          throw new Error("This transaction does not belong to the connected wallet.");
      }
      await assertCurrent();
      controller.reconcileUnknown(context, result);
      if ('transactionHash' in result) {
        const accepted = await controller.resume(recoveryContext);
        if (accepted) await queries.invalidateQueries();
      }
    },
    execute: async (
      prepare: (marketplace: string) => Promise<AccountCall[]> | AccountCall[],
      mode: "trade" | "cancel" = "trade",
    ) => {
      const accepted =
        (await controller.execute(() => current.current, prepare, mode)) ===
        true;
      if (accepted) await queries.invalidateQueries();
      return accepted;
    },
    resume: () => controller.resume(recoveryContext),
    state: snapshot.state,
    busy: snapshot.busy,
    config: config.data,
    configError: config.isError,
    account,
    address,
  };
}
