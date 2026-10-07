import { expect, test } from "@playwright/test";

test("home renders marketplace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", {name:"Marketplace tools"})).toBeVisible();
  await expect(page.getByTestId("marketplace-home")).toBeVisible();
});
