import { expect, test, type Page } from "@playwright/test";

async function openFirstCollection(page: Page) {
  const link=page.getByRole('link',{name:'View Collection',exact:true});
  await expect(link).toBeVisible();await link.click();
}

test.describe("purchase funnel skeleton", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test("adds item to cart from collection grid", async ({ page }) => {
    await page.goto("/");

    await openFirstCollection(page);
    // Use waitForURL with full navigationTimeout – Next.js may need time to compile the
    // [address] route on first access in CI.
    await page.waitForURL(/\/collections\//, { timeout: 30_000 });

    const addButtons = page
      .getByRole("button", { name: "Add to cart" })
      .filter({ hasNotText: "Added" });
    await expect(addButtons.first()).toBeVisible();
    const hasAddableListing = (await addButtons.count()) > 0;
    test.skip(!hasAddableListing, "No addable listings in active collection.");

    await addButtons.first().click();

    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(page.getByText("Your cart is empty.")).toHaveCount(0);
  });

  test("adds the displayed listing to cart from token detail", async ({ page }) => {
    await page.goto("/");

    await openFirstCollection(page);
    await page.waitForURL(/\/collections\//, { timeout: 30_000 });

    const tokenLinks = page.getByRole("link", {name:"View",exact:true});
    await expect(tokenLinks.first()).toBeVisible();
    const hasTokenLink = (await tokenLinks.count()) > 0;
    test.skip(!hasTokenLink, "No token cards available in collection grid.");

    await tokenLinks.first().click();
    await expect(page).toHaveURL(/\/collections\/.+\/.+/);

    const addCheapest = page.getByRole("button", { name: "Add to cart" });
    await expect(addCheapest).toBeVisible();
    test.skip(await addCheapest.isDisabled(), "No purchasable listing on token detail.");

    await addCheapest.click();

    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(page.getByText("Your cart is empty.")).toHaveCount(0);
  });

  test("portfolio_lookup_can_open_owned_token_detail", async ({ page }) => {
    await page.goto("/portfolio");

    await expect(page.locator("main[data-testid='portfolio-view']")).toBeVisible();
    await expect(page.getByRole("heading", { name: /portfolio/i })).toBeVisible();

    await expect(page.getByText("Demo data · trading disabled")).toBeVisible();
    await page.getByRole("textbox", { name: /wallet address/i }).fill("0x1");
    await page.getByRole("button", { name: /load holdings/i }).click();

    await expect(page.getByTestId('wallet-profile-view')).toBeVisible();
    const firstTokenLink = page.getByRole("link", { name: /view token/i }).first();
    await expect(firstTokenLink).toBeVisible();
    await firstTokenLink.click();

    await expect(page).toHaveURL(/\/collections\/.+\/.+/);
  });
});
