import { test } from "@playwright/test";
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
