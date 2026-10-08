import { fn } from "storybook/test";
import type { AccountCall } from "../../src/lib/marketplace/write-adapter";
import { ADDRESS, fixtureConfig, MARKET, useScenario } from "../scenario";
export const signCalls = fn(async (calls: AccountCall[]) => ({
  transaction_hash: "0x123",
  callCount: calls.length,
}));
export const execute = fn(
  async (
    prepare: (market: string) => AccountCall[] | Promise<AccountCall[]>,
  ) => {
    try {
      const calls = await prepare(MARKET);
      if (useScenario.getState().tradeOutcome === "rejected")
        throw new Error(
          "Transaction rejected in wallet. No trade was submitted.",
        );
      await signCalls(calls);
      if (useScenario.getState().tradeOutcome === "pending") {
        useScenario.setState({
          tradeState: {
            stage: "submitted",
            message: "Transaction submitted. Waiting for acceptance…",
            hash: "0x123",
          },
        });
        return false;
      }
      useScenario.setState({
        tradeState: {
          stage: "reflected",
          message: "Trade confirmed and marketplace updated.",
          hash: "0x123",
        },
      });
      return true;
    } catch (error) {
      useScenario.setState({
        tradeState: {
          stage: "error",
          message: error instanceof Error ? error.message : "Request failed.",
        },
      });
      return false;
    }
  },
);
export function useTrade() {
  const state = useScenario();
  return {
    execute,
    resume: async () => false,
    reconcileUnknown,
    state: state.tradeState,
    busy: ["signature", "submitted", "indexing"].includes(
      state.tradeState.stage,
    ),
    address: state.connected ? ADDRESS : undefined,
    config: {
      ...fixtureConfig,
      demo: state.demo,
      status: {
        ...fixtureConfig.status,
        safeForCheckout: state.marketStatus === "ready",
      },
    },
    configError: state.marketStatus === "error",
  };
}

export const reconcileUnknown = fn(
  async (
    _result: { transactionHash: string } | { confirmedNotSubmitted: true },
  ) => {
    useScenario.setState({ tradeState: { stage: "idle", message: "" } });
  },
);
