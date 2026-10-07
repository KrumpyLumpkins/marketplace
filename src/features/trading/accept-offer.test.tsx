import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AcceptOffer } from "./accept-offer";
import type { ApiOrder } from "@/lib/marketplace/types";
const { trade, request } = vi.hoisted(() => ({
  trade: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/lib/marketplace/use-trade", () => ({ useTrade: trade }));
vi.mock("@/lib/marketplace/api-client", () => ({
  marketplaceRequest: request,
}));
const order = {
  id: "LOCAL:0x9:0x3:1",
  collection: "0xa",
  kind: "collection_offer",
  currency: "0x1",
} as ApiOrder;
const quote = {
  canSubmit: true,
  currency: "0x1",
  reasons: [],
  expiresAt: 2000000000,
  rows: [
    {
      key: order.id,
      valid: true,
      sellerProceeds: "90",
      protocolFee: "2",
      royaltyAmount: "8",
      needsNftApproval: false,
    },
  ],
};
beforeEach(() => {
  trade.mockReturnValue({
    address: "0x2",
    busy: false,
    config: { chain: "LOCAL", marketplace: "0x9", demo: false },
    state: { stage: "idle", message: "" },
    execute: vi.fn(),
  });
  request.mockReset().mockResolvedValue(quote);
});
it("requires a fresh review when the selected NFT changes", async () => {
  const { rerender } = render(<AcceptOffer order={order} tokenId="1" />);
  fireEvent.click(screen.getByText("Review offer"));
  await screen.findByText("Confirm acceptance");
  rerender(<AcceptOffer order={order} tokenId="2" />);
  expect(screen.queryByText("Confirm acceptance")).toBeNull();
});
it("does not retain an old confirmation after preflight fails", async () => {
  render(<AcceptOffer order={order} tokenId="1" />);
  fireEvent.click(screen.getByText("Review offer"));
  await screen.findByText("Confirm acceptance");
  request.mockRejectedValue(new Error("Offer cancelled"));
  fireEvent.click(screen.getByText("Review offer"));
  await screen.findByText("Offer cancelled");
  expect(screen.queryByText("Confirm acceptance")).toBeNull();
});
it("prevents duplicate preview requests while checking", async () => {
  request.mockReturnValue(new Promise(() => {}));
  render(<AcceptOffer order={order} tokenId="1" />);
  fireEvent.click(screen.getByText("Review offer"));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /checking|review offer/i }),
    ).toBeDisabled(),
  );
});
