import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NotificationsView } from "./notifications-view";
vi.mock("@/lib/marketplace/use-wallet-session", () => ({
  useWalletSession: () => ({ verified: true, account: "0x2" }),
}));
vi.mock("@/lib/marketplace/api-client", () => ({
  marketplaceRequest: async (path: string) => {
    if (path.endsWith("/read")) throw new Error("Could not save read status");
    return [
      {
        id: "notice",
        type: "order_filled",
        read: false,
        canonical: true,
        provenance: { timestamp: 1 },
      },
    ];
  },
}));
it("shows read-action failures and leaves the notification retryable", async () => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NotificationsView />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText("Mark read"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not save read status",
  );
  expect(screen.getByText("Mark read")).toBeEnabled();
});
