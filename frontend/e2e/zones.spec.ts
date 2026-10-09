import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { accessibleColumnHeader, clickableColumnHeader, signIn } from "./helpers";

/**
 * Hosted zones list / create / edit / delete flows against the seeded backend
 * (SEED_MANY=true gives 5 showcase zones + 30 tenant zones = 35 in total).
 */

const SEEDED_TOTAL = 35;
const FILTER_PLACEHOLDER = "Filter hosted zones by property or value";

interface ZoneSummary {
  id: string;
  name: string;
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}.e2e-test.com`;
}

const table = (page: Page) => page.getByTestId("zones-table");
const rows = (page: Page) => table(page).locator("tbody tr");
const rowByName = (page: Page, name: string) =>
  rows(page).filter({ has: page.getByRole("link", { name, exact: true }) });
/**
 * The sticky header renders every column header twice: an aria-hidden sticky
 * copy that receives pointer events (first in DOM order) and the accessible
 * one inside the table. Click the former, assert on the latter.
 */
const columnHeader = (page: Page, name: string) => accessibleColumnHeader(table(page), name);
const clickableHeader = (page: Page, name: string) => clickableColumnHeader(table(page), name);

async function expectCount(page: Page, count: number) {
  await expect(table(page).getByRole("heading", { name: /Hosted zones/ })).toContainText(
    `(${count})`,
  );
}

async function filterByText(page: Page, text: string) {
  const input = page.getByPlaceholder(FILTER_PLACEHOLDER);
  await input.fill(text);
  await input.press("Enter");
}

async function clearFilter(page: Page) {
  await page.getByRole("button", { name: "Clear filters" }).click();
}

async function selectRow(page: Page, name: string) {
  await rowByName(page, name).getByRole("radio").check({ force: true });
}

async function chooseOption(select: Locator, page: Page, label: string | RegExp) {
  await select.click();
  await page.getByRole("option", { name: label }).first().click();
}

async function createZoneViaApi(page: Page, name: string): Promise<ZoneSummary> {
  const response = await page.request.post("/api/hostedzones", {
    data: { name, type: "public" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const zone = (await response.json()) as ZoneSummary;
  return zone;
}

async function deleteZoneViaApi(page: Page, zoneId: string) {
  await page.request.delete(`/api/hostedzones/${zoneId}?force=true`);
}

async function findZoneIdByName(page: Page, name: string): Promise<string | null> {
  const response = await page.request.get(`/api/hostedzones?name=${encodeURIComponent(name)}`);
  const body = (await response.json()) as { items: ZoneSummary[] };
  return body.items.find((zone) => zone.name === `${name}.`)?.id ?? null;
}

/** Removes zones left behind by earlier (aborted) runs so counts stay deterministic. */
async function removeLeftoverZones(page: Page) {
  const response = await page.request.get("/api/hostedzones?name=e2e-test.com&page_size=100");
  const body = (await response.json()) as { items: ZoneSummary[] };
  for (const zone of body.items) await deleteZoneViaApi(page, zone.id);
  if (body.items.length > 0) await page.reload();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await removeLeftoverZones(page);
});

test.describe("hosted zones list", () => {
  test("renders the seeded zones with the console columns and count badge", async ({ page }) => {
    await expectCount(page, SEEDED_TOTAL);
    for (const column of [
      "Hosted zone name",
      "Type",
      "Created by",
      "Record count",
      "Description",
      "Hosted zone ID",
    ]) {
      await expect(columnHeader(page, column)).toBeVisible();
    }
    await expect(rows(page)).toHaveCount(10);
    // Default sort is by name ascending, so acme-corp.io comes first.
    await expect(rows(page).first()).toContainText("acme-corp.io");
    await expect(rowByName(page, "example.com")).toContainText("Public");
    await expect(rowByName(page, "example.com")).toContainText("Route 53");
    await expect(page.getByPlaceholder(FILTER_PLACEHOLDER)).toBeVisible();
    await expect(page.getByTestId("create-zone")).toBeEnabled();
    await expect(page.getByTestId("view-zone")).toBeDisabled();
    await expect(page.getByTestId("edit-zone")).toBeDisabled();
    await expect(page.getByTestId("delete-zone")).toBeDisabled();
  });

  test("pagination shows different rows on page 2", async ({ page }) => {
    const firstPage = await rows(page).allInnerTexts();
    await page.getByRole("button", { name: "Page 2 of all pages" }).click();
    await expect(rows(page)).toHaveCount(10);
    await expect(rows(page).first()).not.toContainText(firstPage[0] ?? "");
    await expect(rows(page).first()).toContainText("tenant-");
    await page.getByRole("button", { name: "Page 4 of all pages" }).click();
    await expect(rows(page)).toHaveCount(SEEDED_TOTAL - 30);
  });

  test("free-text filter narrows the list and supports no-match + clear", async ({ page }) => {
    // tenant-10 … tenant-19
    await filterByText(page, "tenant-1");
    await expect(page.getByText("10 matches").first()).toBeVisible();
    await expectCount(page, 10);
    await expect(rows(page)).toHaveCount(10);
    await expect(rows(page).first()).toContainText("tenant-10.example.net");
    await expect(rows(page).last()).toContainText("tenant-19.example.net");

    await clearFilter(page);
    await filterByText(page, "no-such-zone-anywhere");
    await expect(page.getByTestId("zones-no-match")).toContainText("No matches");
    await page.getByRole("button", { name: "Clear filter", exact: true }).click();
    await expectCount(page, SEEDED_TOTAL);
  });

  test("filtering by the Type property shows only private zones", async ({ page }) => {
    const input = page.getByPlaceholder(FILTER_PLACEHOLDER);
    await input.fill("Type");
    await page.getByRole("option", { name: /^Type =/ }).click();
    await page
      .getByRole("option", { name: /Private/ })
      .first()
      .click();
    await expect(page.getByText("1 match", { exact: true }).first()).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("internal.local");
    await expectCount(page, 1);
  });

  test("sorting by Record count flips the order", async ({ page }) => {
    const recordCountHeader = columnHeader(page, "Record count");
    const sortedRequest = (order: "asc" | "desc") =>
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/hostedzones?") &&
          response.url().includes("sort=record_count") &&
          response.url().includes(`order=${order}`),
      );

    await Promise.all([sortedRequest("asc"), clickableHeader(page, "Record count").click()]);
    await expect(recordCountHeader).toHaveAttribute("aria-sort", "ascending");
    await expect(rows(page).first()).toContainText("tenant-");

    await Promise.all([sortedRequest("desc"), clickableHeader(page, "Record count").click()]);
    await expect(recordCountHeader).toHaveAttribute("aria-sort", "descending");
    await expect(rows(page).first()).toContainText("example.com");
  });

  test("selecting a row enables the actions and View details opens the zone", async ({ page }) => {
    await selectRow(page, "example.com");
    await expect(page.getByTestId("view-zone")).toBeEnabled();
    await expect(page.getByTestId("edit-zone")).toBeEnabled();
    await expect(page.getByTestId("delete-zone")).toBeEnabled();
    await page.getByTestId("view-zone").click();
    await expect(page).toHaveURL(/\/hostedzones\/Z[A-Z0-9]+$/);
    await expect(page.getByRole("heading", { name: "example.com" })).toBeVisible();
  });

  test("page size preference persists across a reload", async ({ page }) => {
    await page.getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("radio", { name: "20 hosted zones" }).check();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(rows(page)).toHaveCount(20);

    await page.reload();
    await expect(rows(page)).toHaveCount(20);
    await expectCount(page, SEEDED_TOTAL);

    // Restore the default so later tests see 10 rows.
    await page.getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("radio", { name: "10 hosted zones" }).check();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(rows(page)).toHaveCount(10);
  });
});

test.describe("create hosted zone", () => {
  const created: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const name of created.splice(0)) {
      const id = await findZoneIdByName(page, name);
      if (id) await deleteZoneViaApi(page, id);
    }
  });

  test("creates a public zone and lands on the detail page with a flash", async ({ page }) => {
    const name = uniqueName("public");
    created.push(name);

    await page.getByTestId("create-zone").click();
    await expect(page).toHaveURL(/\/hostedzones\/create$/);
    await expect(page.getByRole("heading", { name: "Create hosted zone" })).toBeVisible();

    await page.getByTestId("zone-name").locator("input").fill(name.toUpperCase());
    await page.getByTestId("zone-description").locator("textarea").fill("Created by Playwright");
    await page.getByRole("button", { name: "Add new tag" }).click();
    await page.getByLabel("Tag 1 key").fill("Environment");
    await page.getByLabel("Tag 1 value").fill("e2e");
    await page.getByTestId("zone-form-submit").click();

    await expect(page).toHaveURL(/\/hostedzones\/Z[A-Z0-9]+$/);
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
      `${name} was successfully created.`,
    );
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByText("Created by Playwright")).toBeVisible();
    await expect(page.getByText("Environment = e2e")).toBeVisible();
    await expect(page.getByText("Public hosted zone")).toBeVisible();
  });

  test("creates a private zone with a region and VPC", async ({ page }) => {
    const name = uniqueName("private");
    created.push(name);

    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-name").locator("input").fill(name);
    await expect(page.getByTestId("zone-vpc-section")).toBeHidden();
    await page.getByRole("radio", { name: "Private hosted zone" }).check();
    await expect(page.getByTestId("zone-vpc-section")).toBeVisible();

    // The VPC select is disabled until a region is chosen.
    await expect(page.getByTestId("zone-vpc-id").getByRole("button")).toBeDisabled();
    await chooseOption(page.getByTestId("zone-vpc-region"), page, /Oregon/);
    await chooseOption(page.getByTestId("zone-vpc-id"), page, /staging-vpc/);
    await page.getByTestId("zone-form-submit").click();

    await expect(page).toHaveURL(/\/hostedzones\/Z[A-Z0-9]+$/);
    await expect(page.getByText("Private hosted zone")).toBeVisible();
    await expect(page.getByText("us-west-2")).toBeVisible();
    await expect(page.getByText("vpc-0123456789abcdef0")).toBeVisible();
  });

  test("validates the domain name on the client before calling the API", async ({ page }) => {
    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-form-submit").click();
    await expect(page.getByText("Domain name is required.")).toBeVisible();
    await expect(page).toHaveURL(/\/hostedzones\/create$/);

    await page.getByTestId("zone-name").locator("input").fill("localhost");
    await page.getByTestId("zone-form-submit").click();
    await expect(
      page.getByText(
        "Enter a fully qualified domain name with at least two labels, e.g. example.com.",
      ),
    ).toBeVisible();

    await page.getByTestId("zone-name").locator("input").fill("-bad.example.com");
    await page.getByTestId("zone-form-submit").click();
    await expect(page.getByText("Labels cannot start or end with a hyphen.")).toBeVisible();
  });

  test("private zones require a region and VPC", async ({ page }) => {
    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-name").locator("input").fill(uniqueName("incomplete"));
    await page.getByRole("radio", { name: "Private hosted zone" }).check();
    await page.getByTestId("zone-form-submit").click();
    await expect(page.getByText("Choose the region of the VPC to associate.")).toBeVisible();
    await expect(page).toHaveURL(/\/hostedzones\/create$/);
  });

  test("shows the duplicate-name error from the server on the field", async ({ page }) => {
    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-name").locator("input").fill("example.com");
    await page.getByTestId("zone-form-submit").click();
    await expect(page.getByText("A hosted zone with this name already exists.")).toBeVisible();
    await expect(page).toHaveURL(/\/hostedzones\/create$/);
    await expectZoneCountUnchanged(page);
  });

  test("Cancel returns to the list without creating anything", async ({ page }) => {
    await page.goto("/hostedzones/create");
    await page.getByTestId("zone-name").locator("input").fill(uniqueName("cancelled"));
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/hostedzones$/);
    await expectCount(page, SEEDED_TOTAL);
  });
});

async function expectZoneCountUnchanged(page: Page) {
  const response = await page.request.get("/api/hostedzones?page_size=1");
  const body = (await response.json()) as { total: number };
  expect(body.total).toBe(SEEDED_TOTAL);
}

test.describe("edit and delete hosted zone", () => {
  test("edits the description and tags from the list", async ({ page }) => {
    // Work on a dedicated zone so the seeded data never drifts between runs.
    const name = uniqueName("edit");
    const created = await page.request.post("/api/hostedzones", {
      data: {
        name,
        type: "public",
        description: "Before edit",
        tags: [{ key: "Environment", value: "staging" }],
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    await page.reload();
    await filterByText(page, name);
    await selectRow(page, name);
    await page.getByTestId("edit-zone").click();
    const modal = page.getByTestId("edit-zone-modal");
    await expect(modal.getByRole("heading", { name: "Edit hosted zone" })).toBeVisible();
    await expect(modal.getByText(name)).toBeVisible();
    await expect(modal.getByText("Public hosted zone")).toBeVisible();
    await expect(modal.getByLabel("Tag 1 key")).toHaveValue("Environment");

    const description = `Edited by Playwright ${Date.now()}`;
    await page.getByTestId("edit-zone-description").locator("textarea").fill(description);
    // Keep the existing key, change its value, and add a second tag.
    await modal.getByLabel("Tag 1 value").fill("production");
    await modal.getByRole("button", { name: "Add new tag" }).click();
    await modal.getByLabel("Tag 2 key").fill("EditedBy");
    await modal.getByLabel("Tag 2 value").fill("playwright");
    await page.getByTestId("edit-zone-save").click();

    await expect(modal).toBeHidden();
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
      "Hosted zone updated successfully",
    );
    await expect(rowByName(page, name)).toContainText(description);

    // The change survives a reload (it is persisted server-side).
    await page.reload();
    await filterByText(page, name);
    await expect(rowByName(page, name)).toContainText(description);

    const id = await findZoneIdByName(page, name);
    expect(id).not.toBeNull();
    const detail = (await (await page.request.get(`/api/hostedzones/${id}`)).json()) as {
      tags: { key: string; value: string }[];
    };
    expect(detail.tags).toHaveLength(2);
    expect(detail.tags).toEqual(
      expect.arrayContaining([
        { key: "Environment", value: "production" },
        { key: "EditedBy", value: "playwright" },
      ]),
    );
  });

  test("Escape closes the edit modal without saving", async ({ page }) => {
    await selectRow(page, "acme-corp.io");
    await page.getByTestId("edit-zone").click();
    await expect(page.getByTestId("edit-zone-modal")).toBeVisible();
    await page.getByTestId("edit-zone-description").locator("textarea").fill("Discard me");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("edit-zone-modal")).toBeHidden();
    await expect(rowByName(page, "acme-corp.io")).toContainText("ACME Corp SaaS platform");
  });

  test("delete is blocked for a zone with non-default records", async ({ page }) => {
    await selectRow(page, "example.com");
    await page.getByTestId("delete-zone").click();
    const modal = page.getByTestId("delete-zone-modal");
    await expect(modal.getByRole("heading", { name: "Delete hosted zone" })).toBeVisible();
    await expect(page.getByTestId("delete-zone-blocked")).toContainText(
      "Hosted zone cannot be deleted",
    );
    await expect(page.getByTestId("delete-zone-blocked")).toContainText("other than the default");
    await expect(page.getByTestId("delete-zone-confirm")).toBeDisabled();
    await expect(page.getByTestId("delete-zone-confirmation")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(rowByName(page, "example.com")).toBeVisible();
  });

  test("deletes an empty zone after typing delete", async ({ page }) => {
    const name = uniqueName("empty");
    const zone = await createZoneViaApi(page, name);
    await page.reload();
    await filterByText(page, name);
    await expect(rowByName(page, name)).toBeVisible();

    await selectRow(page, name);
    await page.getByTestId("delete-zone").click();
    await expect(page.getByTestId("delete-zone-blocked")).toHaveCount(0);
    const confirm = page.getByTestId("delete-zone-confirm");
    await expect(confirm).toBeDisabled();
    await page.getByTestId("delete-zone-confirmation").locator("input").fill("DELETE");
    await expect(confirm).toBeDisabled();
    await page.getByTestId("delete-zone-confirmation").locator("input").fill("delete");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId("delete-zone-modal")).toBeHidden();
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
      `Hosted zone ${name} was successfully deleted.`,
    );
    await expect(page.getByTestId("zones-no-match")).toBeVisible();
    await expect(page.getByTestId("delete-zone")).toBeDisabled();

    const lookup = await page.request.get(`/api/hostedzones/${zone.id}`);
    expect(lookup.status()).toBe(404);
  });

  test("the detail page offers edit and delete too", async ({ page }) => {
    const name = uniqueName("detail");
    const zone = await createZoneViaApi(page, name);
    await page.goto(`/hostedzones/${zone.id}`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

    await page.getByTestId("detail-edit-zone").click();
    await page.getByTestId("edit-zone-description").locator("textarea").fill("From detail");
    await page.getByTestId("edit-zone-save").click();
    await expect(page.getByTestId("edit-zone-modal")).toBeHidden();
    await expect(page.getByText("From detail")).toBeVisible();

    await page.getByTestId("detail-delete-zone").click();
    await page.getByTestId("delete-zone-confirmation").locator("input").fill("delete");
    await page.getByTestId("delete-zone-confirm").click();
    await expect(page).toHaveURL(/\/hostedzones$/);
    await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
      "was successfully deleted.",
    );
  });

  test("an unknown zone id shows the not-found state instead of a 404", async ({ page }) => {
    await page.goto("/hostedzones/ZDOESNOTEXIST");
    await expect(page.getByText("Hosted zone not found")).toBeVisible();
    await page.getByRole("button", { name: "Back to hosted zones" }).click();
    await expect(page).toHaveURL(/\/hostedzones$/);
  });
});
