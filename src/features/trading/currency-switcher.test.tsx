import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurrencySwitcher } from "./currency-switcher";
import { DEFAULT_MARKET_CURRENCY, useMarketCurrency } from "@/lib/marketplace/currency-store";

const { mockUseAccount, mockUseBalance } = vi.hoisted(() => ({
  mockUseAccount: vi.fn(),
  mockUseBalance: vi.fn(),
}));

vi.mock("@starknet-react/core", () => ({
  useAccount: mockUseAccount,
  useBalance: mockUseBalance,
}));

vi.mock("@/lib/marketplace/react", () => ({
  useMarketConfig: () => ({ data: undefined }),
}));

const STRK = DEFAULT_MARKET_CURRENCY;
const LORDS = "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49";
const currencies = [
  { address: STRK, symbol: "STRK", decimals: 18 },
  { address: LORDS, symbol: "LORDS", decimals: 18 },
];

describe("CurrencySwitcher", () => {
  beforeEach(() => {
    useMarketCurrency.setState({ currency: STRK });
    mockUseAccount.mockReturnValue({ address: undefined, isConnected: false });
    mockUseBalance.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("marks the remembered currency and switches on click", async () => {
    const user = userEvent.setup();
    render(<CurrencySwitcher currencies={currencies} />);
    expect(screen.getByRole("radio", { name: "STRK (selected)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("radio", { name: "LORDS" }));
    expect(useMarketCurrency.getState().currency).toBe(LORDS);
    expect(screen.getByRole("radio", { name: "LORDS (selected)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("falls back to the first configured currency when the remembered one is unavailable", () => {
    useMarketCurrency.setState({ currency: "0xdead" });
    render(<CurrencySwitcher currencies={currencies} />);
    expect(useMarketCurrency.getState().currency).toBe(STRK);
  });

  it("explains what the currency controls", async () => {
    const user = userEvent.setup();
    render(<CurrencySwitcher currencies={currencies} />);
    await user.hover(screen.getByRole("button", { name: "About market currency" }));
    expect(await screen.findAllByText(/priced in one currency/i)).not.toHaveLength(0);
  });

  it("shows the wallet balance for the selected currency when connected", () => {
    mockUseAccount.mockReturnValue({ address: "0x1", isConnected: true });
    mockUseBalance.mockReturnValue({ data: { formatted: "12.5" }, isLoading: false });
    render(<CurrencySwitcher currencies={currencies} showBalance />);
    expect(screen.getByTestId("currency-balance")).toHaveTextContent("Balance 12.5 STRK");
  });

  it("renders nothing without configured currencies", () => {
    const { container } = render(<CurrencySwitcher currencies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
