import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const DEMO = {
  accountId: "123456789012",
  username: "admin",
  password: "admin123",
} as const;

export async function fillLogin(
  page: Page,
  credentials: { accountId: string; username: string; password: string },
) {
  await page.getByTestId("account-id").locator("input").fill(credentials.accountId);
  await page.getByTestId("username").locator("input").fill(credentials.username);
  await page.getByTestId("password").locator("input").fill(credentials.password);
}

export async function signIn(page: Page) {
  await page.goto("/login");
  await fillLogin(page, DEMO);
  await page.getByTestId("sign-in").click();
  // Generous timeout: the first visit compiles the route on a cold dev server.
  await page.waitForURL(/\/hostedzones$/, { timeout: 45_000 });
  await expect(page.getByTestId("account-label")).toHaveText("admin @ 1234-5678-9012");
}
