import { expect, test } from "@playwright/test";

test("home renders marketplace shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", {name:"Marketplace",exact:true})).toBeVisible();
  await expect(page.getByTestId("marketplace-home")).toBeVisible();
});


test("mobile marketplace navigation and search", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("button",{name:"Open navigation menu"}).click();
  await page.getByRole("dialog",{name:"Marketplace menu"}).getByRole("link",{name:"Trading",exact:true}).click();
  await expect(page).toHaveURL(/\/trader$/);
  await expect(page.getByRole("dialog",{name:"Marketplace menu"})).toHaveCount(0);
  await page.getByRole("button",{name:"Open search"}).click();
  const search=page.getByRole("dialog",{name:"Search marketplace"});
  await search.getByRole("textbox",{name:"Search",exact:true}).fill("Realms");
  await search.getByRole("button",{name:"Search",exact:true}).click();
  await expect(page).toHaveURL(/\/\?q=Realms$/);
  await expect(search).toHaveCount(0);
  await expect(page.getByRole("heading",{name:/^Search: realms$/i})).toBeVisible();
});
