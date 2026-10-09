import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { DEMO, fillLogin, signIn } from "./helpers";

/**
 * Captures the documentation screenshots into docs/screenshots. Opt in with
 * `SCREENSHOTS=1 npx playwright test screenshots` so regular runs stay fast.
 */
const enabled = process.env.SCREENSHOTS === "1";
const outDir = path.resolve(__dirname, "../../docs/screenshots");
const shot = (name: string) => path.join(outDir, `${name}.png`);

test.describe("documentation screenshots", () => {
  test.skip(!enabled, "set SCREENSHOTS=1 to capture");

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await fillLogin(page, DEMO);
    await page.screenshot({ path: shot("login"), fullPage: true });
  });

  test("console shell (light)", async ({ page }) => {
    await signIn(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("shell-light") });
  });

  test("console shell (dark)", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("settings-menu").click();
    await page.getByTestId("settings-menu-dark").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("shell-dark") });
  });
});

const ZONES_API = /\/api\/hostedzones(\?.*)?$/;
const rows = (page: Page) => page.getByTestId("zones-table").locator("tbody tr");

async function selectZone(page: Page, name: string) {
  const checkbox = rows(page)
    .filter({ has: page.getByRole("link", { name, exact: true }) })
    .first()
    .getByRole("checkbox");
  await checkbox.evaluate((input) => {
    const target = input.parentElement?.parentElement ?? input;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(checkbox).toBeChecked();
}

test.describe("hosted zones screenshots", () => {
  test.skip(!enabled, "set SCREENSHOTS=1 to capture");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await expect(rows(page).first()).toBeVisible();
  });

  test("list", async ({ page }) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zones-list") });
  });

  test("list (dark)", async ({ page }) => {
    await page.getByTestId("settings-menu").click();
    await page.getByTestId("settings-menu-dark").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("zones-list-dark") });
  });

  test("list with a filter and page 2", async ({ page }) => {
    const input = page.getByPlaceholder("Filter hosted zones by property or value");
    await input.fill("tenant");
    await input.press("Enter");
    await expect(page.getByText("30 matches").first()).toBeVisible();
    await page.getByRole("button", { name: "Page 2 of all pages" }).click();
    await expect(rows(page).first()).toContainText("tenant-11");
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zones-list-filtered") });
  });

  test("no-match state", async ({ page }) => {
    const input = page.getByPlaceholder("Filter hosted zones by property or value");
    await input.fill("no-such-zone");
    await input.press("Enter");
    await expect(page.getByTestId("zones-no-match")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zones-no-match") });
  });

  test("create page (public)", async ({ page }) => {
    await page.getByTestId("create-zone").click();
    await page.getByTestId("zone-name").locator("input").fill("example.org");
    await page
      .getByTestId("zone-description")
      .locator("textarea")
      .fill("Corporate site and e-mail");
    await page.getByRole("button", { name: "Add new tag" }).click();
    await page.getByLabel("Tag 1 key").fill("Environment");
    await page.getByLabel("Tag 1 value").fill("production");
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zone-create"), fullPage: true });
  });

  test("create page (private)", async ({ page }) => {
    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-name").locator("input").fill("corp.internal");
    await page.getByRole("radio", { name: "Private hosted zone" }).check();
    await page.getByTestId("zone-vpc-region").click();
    await page.getByRole("option", { name: /N\. Virginia/ }).click();
    await page.getByTestId("zone-vpc-id").click();
    await page.getByRole("option", { name: /prod-vpc/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zone-create-private"), fullPage: true });
  });

  test("create page (duplicate-name error)", async ({ page }) => {
    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-name").locator("input").fill("example.com");
    await page.getByTestId("zone-form-submit").click();
    await expect(page.getByText("A hosted zone with this name already exists.")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zone-create-duplicate-error"), fullPage: true });
  });

  test("edit modal", async ({ page }) => {
    await selectZone(page, "example.com");
    await page.getByTestId("edit-zone").click();
    await expect(page.getByTestId("edit-zone-modal")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("zone-edit-modal") });
  });

  test("delete modal (blocked)", async ({ page }) => {
    await selectZone(page, "example.com");
    await page.getByTestId("delete-zone").click();
    await expect(page.getByTestId("delete-zone-blocked")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("zone-delete-blocked") });
  });

  test("delete modal (confirm)", async ({ page }) => {
    const response = await page.request.post("/api/hostedzones", {
      data: { name: "screenshot-empty.example", type: "public" },
    });
    const zone = (await response.json()) as { id: string };
    try {
      await page.reload();
      const input = page.getByPlaceholder("Filter hosted zones by property or value");
      await input.fill("screenshot-empty");
      await input.press("Enter");
      await selectZone(page, "screenshot-empty.example");
      await page.getByTestId("delete-zone").click();
      await page.getByTestId("delete-zone-confirmation").locator("input").fill("delete");
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot("zone-delete-confirm") });
    } finally {
      await page.request.delete(`/api/hostedzones/${zone.id}?force=true`);
    }
  });

  test("zone detail", async ({ page }) => {
    await selectZone(page, "example.com");
    await page.getByTestId("view-zone").click();
    await expect(page.getByRole("heading", { name: "example.com" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zone-detail"), fullPage: true });
  });

  test("empty state", async ({ page }) => {
    await page.route(ZONES_API, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 10 }),
      }),
    );
    await page.reload();
    await expect(page.getByTestId("zones-empty")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zones-empty") });
  });

  test("error state", async ({ page }) => {
    await page.route(ZONES_API, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "InternalError", message: "The hosted zones service is unavailable." },
        }),
      }),
    );
    await page.reload();
    await expect(page.getByTestId("zones-error")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("zones-error") });
  });
});
