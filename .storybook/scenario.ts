import { useMarketCurrency } from "../src/lib/marketplace/currency-store";
import { create } from "zustand";
import type { TradeState } from "../src/lib/marketplace/use-trade";
import type { MarketConfig } from "../src/lib/marketplace/types";
import { useCartStore } from "../src/features/cart/store/cart-store";

export const ADDRESS = "0x1234567890abcdef";
export const CURRENCY =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export const MARKET = "0x900";
export const fixtureConfig: MarketConfig = {
  chain: "LOCAL",
  chainId: "0x534e5f5345504f4c4941",
  marketplace: MARKET,
  feeBps: 200,
  feeRecipient: "0x40",
  paused: false,
  demo: false,
  currencies: [{ address: CURRENCY, symbol: "STRK", decimals: 18 }],
  collections: [{ address: "0xa", name: "Realms" }],
  status: {
    chain: "LOCAL",
    marketplace: MARKET,
    indexedBlock: 100,
    chainHead: 100,
    lagBlocks: 0,
    observedAt: 0,
    generation: 1,
    safeForCheckout: true,
    reasons: [],
  },
};
type Scenario = {
  apiState: "ready" | "empty" | "error" | "pending";
  bidComplete: boolean;
  connected: boolean;
  connecting: boolean;
  walletOutcome: "success" | "rejected" | "pending" | "missing";
  tradeState: TradeState;
  tradeOutcome: "success" | "rejected" | "pending";
  preflight: "valid" | "unavailable";
  demo: boolean;
};
const initial: Scenario = {
  apiState: "ready",
  bidComplete: true,
  connected: false,
  connecting: false,
  walletOutcome: "success",
  tradeState: { stage: "idle", message: "" },
  tradeOutcome: "success",
  preflight: "valid",
  demo: false,
};
export const useScenario = create<Scenario>(() => ({ ...initial }));
export function resetScenario() {
  useScenario.setState({
    ...initial,
    tradeState: { stage: "idle", message: "" },
  });
  useMarketCurrency.setState({ currency: CURRENCY });
  useCartStore.setState({
    items: [],
    isOpen: false,
    inlineErrors: {},
    lastActionError: null,
  });
}
export const cartItem = {
  orderId: "LOCAL:0x900:0x2:1",
  collection: "0xa",
  tokenId: "1",
  price: "2000000000000000000",
  currency: CURRENCY,
  quantity: "1",
  tokenName: "Realm #1",
  tokenImage: "/banners/realms.png",
};
