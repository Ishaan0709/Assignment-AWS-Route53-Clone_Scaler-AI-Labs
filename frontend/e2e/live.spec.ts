import { expect, test } from "@playwright/test";
import { fillLogin, DEMO } from "./helpers";

/**
 * One pass against the deployed site. Skipped unless LIVE_URL is set, so CI
 * keeps using the local servers.
 */
const live = process.env.LIVE_URL;

test.skip(!live, "set LIVE_URL to smoke-test the deployment");
test.use({ baseURL: live });

test("login, create a zone and a record, refresh, then log out", async ({ page }) => {
  test.setTimeout(120_000);
  const label = `live-${Date.now().toString(36)}.demo`;

  await page.goto("/login");
  await fillLogin(page, DEMO);
  await page.getByTestId("sign-in").click();
  await page.waitForURL(/\/hostedzones$/);

  await page.getByTestId("create-zone").click();
  await page.getByTestId("zone-name").locator("input").fill(label);
  await page.getByTestId("zone-form-submit").click();
  await expect(page).toHaveURL(/\/hostedzones\/Z[A-Z0-9]+$/);
  const zoneId = page.url().split("/").pop() ?? "";

  await page.getByTestId("create-record").click();
  await page.getByTestId("record-name-0").locator("input").fill("www");
  await page.getByTestId("record-values-0").locator("textarea").fill("192.0.2.55");
  await page.getByTestId("record-form-submit").click();
  const row = page.getByTestId("records-table").getByRole("row", { name: /www\..*\sA\b/ });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();

  await page.request.delete(`/api/hostedzones/${zoneId}?force=true`);
  await page.getByTestId("account-menu").click();
  await page.getByTestId("account-menu-signout").click();
  await expect(page).toHaveURL(/\/login$/);
});
