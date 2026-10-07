import { fn } from "storybook/test";
import { ADDRESS, useScenario } from "../scenario";
export const connectAsync = fn(async () => {
  useScenario.setState({ connecting: true });
  const outcome = useScenario.getState().walletOutcome;
  if (outcome === "pending") return new Promise<void>(() => {});
  try {
    if (outcome === "rejected")
      throw new Error("Connection rejected. Try again when you are ready.");
    useScenario.setState({ connected: true });
  } finally {
    useScenario.setState({ connecting: false });
  }
});
export const disconnect = fn(() => {
  useScenario.setState({ connected: false });
});
const connectors = [
  { id: "controller", name: "Controller", available: () => true },
  {
    id: "braavos",
    name: "Braavos",
    available: () => useScenario.getState().walletOutcome !== "missing",
  },
];
export function useAccount() {
  const connected = useScenario((s) => s.connected);
  return {
    address: connected ? ADDRESS : undefined,
    isConnected: connected,
    status: connected ? "connected" : "disconnected",
  };
}
export function useConnect() {
  return {
    connectAsync,
    connect: connectAsync,
    connectors,
    isPending: useScenario((s) => s.connecting),
  };
}
export function useDisconnect() {
  return { disconnect, isPending: false };
}
export function useBalance() {
  return { data: undefined, isLoading: false };
}
