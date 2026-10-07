import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReportToken } from "./report-token";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/marketplace/api-client", () => ({
  marketplaceRequest: request,
}));
vi.mock("@/lib/marketplace/use-wallet-session", () => ({
  useWalletSession: () => ({ verified: true }),
}));
it("prevents duplicate reports while preserving entered text on failure", async () => {
  let reject!: (e: Error) => void;
  request.mockReturnValue(
    new Promise((_, r) => {
      reject = r;
    }),
  );
  render(<ReportToken collection="0xa" tokenId="1" />);
  fireEvent.click(screen.getByText("Report this item"));
  fireEvent.change(screen.getByLabelText("Report reason"), {
    target: { value: "The metadata is incorrect" },
  });
  fireEvent.click(screen.getByText("Submit report"));
  expect(
    screen.getByRole("button", { name: /submit|sending/i }),
  ).toBeDisabled();
  reject(new Error("Service unavailable"));
  await screen.findByText("Service unavailable");
  expect(screen.getByLabelText("Report reason")).toHaveValue(
    "The metadata is incorrect",
  );
  expect(screen.getByText("Submit report")).toBeEnabled();
});
