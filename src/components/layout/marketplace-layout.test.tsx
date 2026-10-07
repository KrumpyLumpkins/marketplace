import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarketplaceLayout } from "./marketplace-layout";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/marketplace/api-client", () => ({marketplaceRequest:request}));
vi.mock("next/navigation", () => ({usePathname:()=>"/",useRouter:()=>({push:vi.fn()})}));
it("renders page content without mounting collection discovery or fetching its list", () => {
  render(<MarketplaceLayout><main>Assets</main></MarketplaceLayout>);
  expect(screen.getByRole("main")).toHaveTextContent("Assets");
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
