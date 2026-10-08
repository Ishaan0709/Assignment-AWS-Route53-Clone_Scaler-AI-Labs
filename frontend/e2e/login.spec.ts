import { expect, test } from "@playwright/test";
import { DEMO, fillLogin, signIn } from "./helpers";

test.describe("authentication", () => {
  test("shows the IAM sign-in page with the demo hint", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in as IAM user" })).toBeVisible();
    await expect(page.getByTestId("demo-hint")).toContainText("123456789012");
    await expect(page.getByTestId("demo-hint")).toContainText("admin123");
  });

  test("validates required fields inline", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("sign-in").click();
    await expect(page.getByText("Enter your account ID or alias.")).toBeVisible();
    await expect(page.getByText("Enter your IAM user name.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects bad credentials with an error message", async ({ page }) => {
    await page.goto("/login");
    await fillLogin(page, { ...DEMO, password: "wrong-password" });
    await page.getByTestId("sign-in").click();
    await expect(page.getByTestId("login-error")).toContainText("Authentication failed");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in with the demo credentials and lands on hosted zones", async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId("top-nav")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Hosted zones" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Route 53 navigation" })).toContainText(
      "Hosted zones",
    );
    await expect(page.getByTestId("bottom-bar")).toContainText("CloudShell");
  });

  test("keeps the session across a page refresh", async ({ page }) => {
    await signIn(page);
    await page.reload();
    await expect(page).toHaveURL(/\/hostedzones$/);
    await expect(page.getByTestId("account-label")).toHaveText("admin @ 1234-5678-9012");
  });

  test("the Fill in button populates the demo credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("fill-demo").click();
    await expect(page.getByTestId("account-id").locator("input")).toHaveValue(DEMO.accountId);
    await expect(page.getByTestId("username").locator("input")).toHaveValue(DEMO.username);
    await page.getByTestId("sign-in").click();
    await expect(page).toHaveURL(/\/hostedzones$/);
  });

  test("redirects protected routes to login when signed out", async ({ page }) => {
    await page.goto("/hostedzones");
    await expect(page).toHaveURL(/\/login\?next=%2Fhostedzones/);
    await page.goto("/resolver/rules");
    await expect(page).toHaveURL(/\/login\?next=%2Fresolver%2Frules/);
  });

  test("returns to the requested page after signing in", async ({ page }) => {
    await page.goto("/health-checks");
    await expect(page).toHaveURL(/\/login\?next=/);
    await fillLogin(page, DEMO);
    await page.getByTestId("sign-in").click();
    await expect(page).toHaveURL(/\/health-checks$/);
    await expect(page.getByRole("heading", { level: 1, name: "Health checks" })).toBeVisible();
  });

  test("signs out from the account menu and shows an info flash", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("account-menu").click();
    await page.getByTestId("account-menu-signout").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
      "You have been signed out",
    );

    // The session cookie is gone, so the console is locked again.
    await page.goto("/hostedzones");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a stale cookie is rejected by the API guard", async ({ page, context }) => {
    await context.addCookies([
      { name: "session", value: "not-a-real-session", domain: "localhost", path: "/" },
    ]);
    await page.goto("/hostedzones");
    await expect(page).toHaveURL(/\/login\?next=%2Fhostedzones/);
  });
});

test.describe("console shell", () => {
  test("navigates between placeholder pages via the side navigation", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Route 53 navigation" });
    await nav.getByRole("link", { name: "Query logging" }).click();
    await expect(page).toHaveURL(/\/resolver\/query-logging$/);
    await expect(page.getByRole("heading", { level: 1, name: "Query logging" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toContainText("Resolver");

    await nav.getByRole("link", { name: "Registered domains" }).click();
    await expect(page).toHaveURL(/\/domains\/registered$/);
    await expect(page.getByRole("heading", { level: 1, name: "Registered domains" })).toBeVisible();
  });

  test("toggles dark mode from the settings menu and persists it", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("settings-menu").click();
    await page.getByTestId("settings-menu-dark").click();
    await expect(page.locator("body")).toHaveClass(/awsui-dark-mode/);
    await page.reload();
    await expect(page.locator("body")).toHaveClass(/awsui-dark-mode/);
    await page.getByTestId("settings-menu").click();
    await page.getByTestId("settings-menu-light").click();
    await expect(page.locator("body")).not.toHaveClass(/awsui-dark-mode/);
  });
});
