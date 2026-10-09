import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { accessibleColumnHeader, clickableColumnHeader, signIn } from "./helpers";

/**
 * Hosted zone detail and record create / edit / delete. Each test uses its own
 * zone so it does not depend on the seeded record set.
 */

interface ZoneSummary {
  id: string;
  name: string;
}

const RECORD_COLUMNS = [
  "Record name",
  "Type",
  "Routing policy",
  "Differential",
  "Alias",
  "Value/Route traffic to",
  "TTL (seconds)",
  "Health check ID",
  "Evaluate target health",
];

const NINE_TYPES = [
  { type: "A", name: "www", value: "192.0.2.50" },
  { type: "AAAA", name: "v6", value: "2001:db8::50" },
  { type: "CNAME", name: "cdn", value: "target.example.net." },
  { type: "TXT", name: "spf", value: '"v=spf1 -all"' },
  { type: "MX", name: "mailmx", value: "10 mail.example.net." },
  { type: "NS", name: "deleg", value: "ns1.example.net." },
  { type: "PTR", name: "ptr", value: "host.example.net." },
  { type: "SRV", name: "_sip._tcp", value: "10 5 5060 sip.example.net." },
  { type: "CAA", name: "caa", value: '0 issue "letsencrypt.org"' },
] as const;

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.e2e-test.com`;
}

const recordsTable = (page: Page) => page.getByTestId("records-table");
const recordRows = (page: Page) => recordsTable(page).locator("tbody tr");

function rowFor(page: Page, name: string, type: string) {
  return recordRows(page)
    .filter({ hasText: name })
    .filter({ has: page.getByRole("cell", { name: type, exact: true }) });
}

function defaultRow(page: Page, type: "NS" | "SOA") {
  return recordRows(page)
    .filter({ has: page.getByTestId("default-record") })
    .filter({ has: page.getByRole("cell", { name: type, exact: true }) });
}

async function createZone(page: Page, name: string): Promise<ZoneSummary> {
  const response = await page.request.post("/api/hostedzones", {
    data: { name, type: "public" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as ZoneSummary;
}

async function deleteZone(page: Page, zoneId: string) {
  await page.request.delete(`/api/hostedzones/${zoneId}?force=true`);
}

async function openZone(page: Page, prefix: string): Promise<ZoneSummary & { label: string }> {
  const label = uniqueName(prefix);
  const zone = await createZone(page, label);
  await page.goto(`/hostedzones/${zone.id}`);
  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  await expect(page.getByTestId("default-record").first()).toBeVisible();
  return { ...zone, label };
}

async function openSelect(page: Page, testId: string) {
  await page.getByTestId(testId).getByRole("button").click();
}

async function chooseType(page: Page, type: string) {
  if (type === "A") return;
  await openSelect(page, "record-type-0");
  await page.getByRole("option", { name: type, exact: true }).click();
}

async function chooseTtl(page: Page, label: string) {
  await page
    .getByTestId("record-ttl-presets-0")
    .getByRole("button", { name: label, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe("hosted zone detail", () => {
  test("shows the zone, the records table and blocks deleting the default NS and SOA", async ({
    page,
  }) => {
    const zone = await openZone(page, "detail");
    try {
      await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toContainText(zone.label);
      await expect(page.getByTestId("zone-details")).toContainText(zone.id);
      await expect(page.getByTestId("zone-details")).toContainText("Name servers");
      for (const column of RECORD_COLUMNS) {
        await expect(accessibleColumnHeader(recordsTable(page), column)).toBeVisible();
      }
      await expect(page.getByRole("tab", { name: /Records \(2\)/ })).toBeVisible();
      await expect(page.getByRole("tab", { name: "DNSSEC signing" })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Hosted zone tags \(0\)/ })).toBeVisible();

      const defaults = recordRows(page).filter({ has: page.getByTestId("default-record") });
      await expect(defaults).toHaveCount(2);
      await defaults.first().getByRole("checkbox").check({ force: true });
      await defaults.nth(1).getByRole("checkbox").check({ force: true });
      await expect(page.getByTestId("delete-record")).toBeDisabled();
      await expect(page.getByTestId("edit-record")).toBeDisabled();

      await page.getByRole("tab", { name: "DNSSEC signing" }).click();
      await expect(page.getByTestId("dnssec-placeholder")).toContainText("coming soon");
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("saves hosted zone tags and keeps them after a refresh", async ({ page }) => {
    const zone = await openZone(page, "tags");
    try {
      await page.getByRole("tab", { name: /Hosted zone tags/ }).click();
      await page.getByRole("button", { name: "Add new tag" }).click();
      await page.getByLabel("Tag 1 key").fill("env");
      await page.getByLabel("Tag 1 value").fill("test");
      await page.getByTestId("save-tags").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
        "Hosted zone tags updated successfully",
      );
      await page.reload();
      await page.getByRole("tab", { name: /Hosted zone tags \(1\)/ }).click();
      await expect(page.getByLabel("Tag 1 key")).toHaveValue("env");
      await expect(page.getByLabel("Tag 1 value")).toHaveValue("test");
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("edits the default NS TTL and leaves the name read-only", async ({ page }) => {
    const zone = await openZone(page, "ns");
    try {
      const ns = defaultRow(page, "NS");
      await ns.getByRole("checkbox").check({ force: true });
      await expect(page.getByTestId("delete-record")).toBeDisabled();
      await page.getByTestId("edit-record").click();
      await expect(page.getByTestId("record-locked")).toBeVisible();
      await expect(page.getByTestId("record-name-0").locator("input")).toBeDisabled();
      await chooseTtl(page, "1m");
      await page.getByTestId("record-form-submit").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
        "Record updated successfully",
      );
      await page.reload();
      await expect(defaultRow(page, "NS")).toContainText("60");
    } finally {
      await deleteZone(page, zone.id);
    }
  });
});

test.describe("record create, edit and delete", () => {
  test("creates, edits and deletes all nine record types, and they survive a refresh", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const zone = await openZone(page, "types");
    try {
      for (const record of NINE_TYPES) {
        await page.getByTestId("create-record").click();
        await page.getByTestId("record-name-0").locator("input").fill(record.name);
        await chooseType(page, record.type);
        await page.getByTestId("record-values-0").locator("textarea").fill(record.value);
        await page.getByTestId("record-form-submit").click();
        await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
          "1 record created",
        );
        await page.reload();
        const row = rowFor(page, record.name, record.type);
        await expect(row).toBeVisible();
        await expect(row).toContainText("300");

        await row.getByRole("checkbox").check({ force: true });
        await page.getByTestId("edit-record").click();
        await chooseTtl(page, "1m");
        await page.getByTestId("record-form-submit").click();
        await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
          "Record updated successfully",
        );
        await page.reload();
        await expect(rowFor(page, record.name, record.type)).toContainText("60");

        await rowFor(page, record.name, record.type).getByRole("checkbox").check({ force: true });
        await page.getByTestId("delete-record").click();
        await expect(page.getByTestId("delete-records-modal")).toContainText(record.type);
        await page.getByTestId("delete-records-confirm").click();
        await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
          "1 record deleted",
        );
        await page.reload();
        await expect(rowFor(page, record.name, record.type)).toHaveCount(0);
      }
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("rejects an invalid A value on the value field", async ({ page }) => {
    const zone = await openZone(page, "invalid");
    try {
      await page.getByTestId("create-record").click();
      await page.getByTestId("record-name-0").locator("input").fill("bad");
      await page.getByTestId("record-values-0").locator("textarea").fill("not-an-ip");
      await page.getByTestId("record-form-submit").click();
      await expect(page.getByText("is not a valid IPv4 address")).toBeVisible();
      await expect(page).toHaveURL(/\/records\/create$/);
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("creates an alias and a weighted record", async ({ page }) => {
    const zone = await openZone(page, "alias");
    try {
      await page.getByTestId("create-record").click();
      await page.getByTestId("record-name-0").locator("input").fill("cdn");
      await page.getByTestId("record-alias-0").getByRole("checkbox").check();
      await openSelect(page, "record-alias-target-0");
      await page.getByRole("option", { name: /CloudFront/ }).click();
      await page.getByTestId("record-form-submit").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
        "1 record created",
      );
      const alias = rowFor(page, "cdn", "A");
      await expect(alias).toContainText("Yes");
      await expect(alias).toContainText("cloudfront.net");
      await expect(alias).toContainText("-");

      await page.getByTestId("create-record").click();
      await page.getByTestId("record-name-0").locator("input").fill("api");
      await page.getByTestId("record-values-0").locator("textarea").fill("192.0.2.8");
      await openSelect(page, "record-routing-0");
      await page.getByRole("option", { name: "Weighted", exact: true }).click();
      await page.getByTestId("record-set-id-0").locator("input").fill("blue");
      await page.getByTestId("record-weight-0").locator("input").fill("70");
      await page.getByTestId("record-form-submit").click();
      await page.reload();
      await expect(rowFor(page, "api", "A")).toContainText("Weight: 70");
      await expect(rowFor(page, "api", "A")).toContainText("blue");
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("creates two records in one submit and bulk-deletes them", async ({ page }) => {
    const zone = await openZone(page, "bulk");
    try {
      await page.getByTestId("create-record").click();
      await page.getByTestId("record-name-0").locator("input").fill("one");
      await page.getByTestId("record-values-0").locator("textarea").fill("192.0.2.11");
      await page.getByTestId("add-record").click();
      await page.getByTestId("record-name-1").locator("input").fill("two");
      await page.getByTestId("record-values-1").locator("textarea").fill("192.0.2.12");
      await page.getByTestId("record-form-submit").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
        "2 records created",
      );
      await page.reload();
      await rowFor(page, "one", "A").getByRole("checkbox").check({ force: true });
      await rowFor(page, "two", "A").getByRole("checkbox").check({ force: true });
      await page.getByTestId("delete-record").click();
      await expect(page.getByTestId("delete-records-modal")).toContainText("one");
      await expect(page.getByTestId("delete-records-modal")).toContainText("two");
      await page.getByTestId("delete-records-confirm").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
        "2 records deleted",
      );
      await page.reload();
      await expect(rowFor(page, "one", "A")).toHaveCount(0);
      await expect(rowFor(page, "two", "A")).toHaveCount(0);
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("filters by type on the server and sorts from the sticky header", async ({ page }) => {
    const zone = await openZone(page, "filter");
    try {
      await page.getByTestId("create-record").click();
      await page.getByTestId("record-name-0").locator("input").fill("web");
      await page.getByTestId("record-values-0").locator("textarea").fill("192.0.2.20");
      await page.getByTestId("record-form-submit").click();
      await expect(page.getByTestId("records-table")).toBeVisible();
      await openSelect(page, "record-type-filter");
      const filtered = page.waitForRequest(
        (request) => request.url().includes("/records") && request.url().includes("type=A"),
      );
      await page.getByRole("option", { name: "A", exact: true }).click();
      await filtered;
      await expect(rowFor(page, "web", "A")).toBeVisible();
      await expect(
        recordRows(page).filter({ has: page.getByRole("cell", { name: "NS", exact: true }) }),
      ).toHaveCount(0);

      const sorted = page.waitForRequest(
        (request) => request.url().includes("/records") && request.url().includes("sort=type"),
      );
      await clickableColumnHeader(recordsTable(page), "Type").click();
      await sorted;
      await expect(accessibleColumnHeader(recordsTable(page), "Type")).toHaveAttribute(
        "aria-sort",
        /ascending|descending/,
      );
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("parses a zone file, shows line errors, then imports", async ({ page }) => {
    const zone = await openZone(page, "import");
    try {
      await page.getByTestId("import-zone-file").click();
      await page
        .getByTestId("import-text")
        .locator("textarea")
        .fill("imported 300 IN A 192.0.2.77\nthis is not a record\n");
      await page.getByTestId("import-parse").click();
      await expect(page.getByTestId("import-summary")).toBeVisible();
      await expect(page.getByTestId("import-errors")).toContainText(/Line \d+/);
      await expect(page.getByTestId("import-zone-modal")).toContainText("192.0.2.77");
      await page.getByTestId("import-confirm").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText("Imported");
      await expect(page.getByTestId("import-zone-modal")).toBeHidden();
      await page.reload();
      await expect(rowFor(page, "imported", "A")).toContainText("192.0.2.77");
    } finally {
      await deleteZone(page, zone.id);
    }
  });

  test("test record and query logging modals are mocked", async ({ page }) => {
    const zone = await openZone(page, "mock");
    try {
      await page.getByTestId("test-record").click();
      await page.getByTestId("test-record-name").locator("input").fill("www");
      await page.getByTestId("test-record-run").click();
      await expect(page.getByTestId("test-record-answer")).toContainText("mocked");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("test-record-modal")).toBeHidden();

      await page.getByTestId("configure-query-logging").click();
      await page.getByTestId("query-logging-save").click();
      await expect(page.getByRole("list", { name: "Notifications" })).toContainText(
        "Query logging configuration saved",
      );
    } finally {
      await deleteZone(page, zone.id);
    }
  });
});
