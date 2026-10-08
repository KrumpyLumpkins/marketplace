import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionsTable, listedShare } from "./collections-table";

const { request, push } = vi.hoisted(() => ({ request: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/marketplace/api-client", () => ({ marketplaceRequest: request }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ETH = 10n ** 18n;
const collections = [
  { address: "0xa", name: "Realms", floorPrice: "22", floorRaw: (22n * ETH).toString(), floorCurrency: STRK, totalSupply: "8000", listingCount: "400", verified: true },
  { address: "0xb", name: "Beasts", floorPrice: "5", floorRaw: (5n * ETH).toString(), floorCurrency: STRK, totalSupply: "1000", listingCount: "3" },
  { address: "0xc", name: "Loot Chests", floorPrice: null, floorRaw: null, floorCurrency: STRK, totalSupply: "50", listingCount: "0" },
];

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CollectionsTable collections={collections} currency={STRK} />
    </QueryClientProvider>,
  );
}

function rowNames() {
  return screen.getAllByRole("row").slice(1).map((row) => within(row).getByRole("link").textContent);
}

describe("CollectionsTable", () => {
  beforeEach(() => {
    request.mockReset();
    push.mockReset();
    request.mockImplementation(async (path: string) => {
      const volume = path.includes("0xb") ? 90n * ETH : path.includes("0xa") ? 40n * ETH : 0n;
      return {
        days: 7,
        byCurrency: volume > 0n ? [{ currency: STRK, volume: volume.toString(), sales: 2, history: [] }] : [],
        floors: [],
      };
    });
  });

  it("keeps the configured order by default and shows floor, listed share and supply", async () => {
    renderTable();
    expect(rowNames()).toEqual(["Realms", "Beasts", "Loot Chests"]);
    expect(screen.getByText("22")).toBeVisible();
    expect(screen.getByText("(5%)")).toBeVisible();
    expect(screen.getByText("8000")).toBeVisible();
    expect(await screen.findByText("90")).toBeVisible();
    expect(screen.getByText("No sales")).toBeVisible();
    expect(screen.getByLabelText("Verified collection")).toBeInTheDocument();
  });

  it("sorts by floor and by volume, highest first, then flips", async () => {
    const user = userEvent.setup();
    renderTable();
    await screen.findByText("90");
    await user.click(screen.getByRole("button", { name: /^Floor/ }));
    expect(rowNames()[0]).toBe("Realms");
    expect(rowNames()[2]).toBe("Loot Chests");
    await user.click(screen.getByRole("button", { name: /^Floor/ }));
    expect(rowNames()[0]).toBe("Beasts");
    await user.click(screen.getByRole("button", { name: /^7d volume/ }));
    expect(rowNames()[0]).toBe("Beasts");
    expect(screen.getByRole("columnheader", { name: /7d volume/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("opens the collection when a row is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByText("Beasts").closest("tr")!);
    expect(push).toHaveBeenCalledWith("/collections/0xb");
  });

  it("formats listed share with a floor for tiny shares", () => {
    expect(listedShare(400, 8000)).toBe("5%");
    expect(listedShare(1, 8000)).toBe("<1%");
    expect(listedShare(0, 10)).toBe("0%");
    expect(listedShare(null, 10)).toBeNull();
    expect(listedShare(3, 0)).toBeNull();
  });
});
