import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecordsTable } from "@/components/records/RecordsTable";
import type * as RecordsModule from "@/hooks/useRecords";
import type { DnsRecord } from "@/types/api";
import { renderWithProviders } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/hostedzones/Z0123456789ABCDEFGHIJ",
}));

const useRecordsMock = vi.fn();
vi.mock("@/hooks/useRecords", async (importOriginal) => {
  const actual = await importOriginal<typeof RecordsModule>();
  return { ...actual, useRecords: (...args: unknown[]) => useRecordsMock(...args) };
});

type RecordsResult = ReturnType<typeof RecordsModule.useRecords>;

function queryResult(overrides: Partial<RecordsResult>): RecordsResult {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as RecordsResult;
}

function makeRecord(overrides: Partial<DnsRecord> = {}): DnsRecord {
  return {
    id: 1,
    zone_id: "Z0123456789ABCDEFGHIJ",
    name: "www.example.com.",
    type: "A",
    ttl: 300,
    values: ["192.0.2.1", "192.0.2.2"],
    routing_policy: "Simple",
    set_identifier: null,
    weight: null,
    is_alias: false,
    alias_target: null,
    evaluate_target_health: null,
    health_check_id: null,
    comment: null,
    is_default: false,
    created_at: "2026-10-01T10:00:00",
    updated_at: "2026-10-01T10:00:00",
    ...overrides,
  };
}

beforeEach(() => {
  useRecordsMock.mockReset();
  push.mockReset();
  window.localStorage.clear();
});

describe("RecordsTable", () => {
  it("renders the Route 53 columns, stacked values and the default mark", async () => {
    useRecordsMock.mockReturnValue(
      queryResult({
        data: {
          items: [
            makeRecord({
              id: 10,
              name: "example.com.",
              type: "NS",
              is_default: true,
              ttl: 172800,
              values: ["ns-1.awsdns-01.org."],
            }),
            makeRecord(),
          ],
          total: 2,
          page: 1,
          page_size: 10,
        },
      }),
    );
    renderWithProviders(<RecordsTable zoneId="Z0123456789ABCDEFGHIJ" />);
    const table = screen.getByTestId("records-table");
    for (const header of [
      "Record name",
      "Type",
      "Routing policy",
      "Differential",
      "Alias",
      "Value/Route traffic to",
      "TTL (seconds)",
      "Health check ID",
      "Evaluate target health",
    ]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeVisible();
    }
    expect(within(table).getByText("192.0.2.1")).toBeVisible();
    expect(within(table).getByText("192.0.2.2")).toBeVisible();
    expect(within(table).getByTestId("default-record")).toBeVisible();
    const defaultBox = within(table).getByRole("checkbox", { name: /example.com NS/ });
    expect(defaultBox).toBeEnabled();
    await userEvent.click(defaultBox);
    expect(screen.getByTestId("delete-record")).toBeDisabled();
    expect(screen.getByTestId("edit-record")).toBeEnabled();
    await userEvent.click(within(table).getByRole("checkbox", { name: /www.example.com A/ }));
    expect(screen.getByTestId("delete-record")).toBeEnabled();
  });

  it("asks the API for the first page without a sort so apex NS and SOA stay first", () => {
    useRecordsMock.mockReturnValue(queryResult({ isPending: true }));
    renderWithProviders(<RecordsTable zoneId="Z1" />);
    expect(useRecordsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ zoneId: "Z1", page: 1, page_size: 10, sort: undefined }),
    );
  });

  it("shows a no-match state with clear filter, and an error state with retry", async () => {
    useRecordsMock.mockReturnValue(
      queryResult({ data: { items: [], total: 0, page: 1, page_size: 10 } }),
    );
    const { rerender } = renderWithProviders(<RecordsTable zoneId="Z1" />);
    expect(screen.getByTestId("records-empty")).toBeVisible();

    await userEvent.type(
      screen.getByPlaceholderText("Filter records by property or value"),
      "nothing-here",
    );
    await userEvent.click(screen.getByRole("option", { name: /nothing-here/ }));
    expect(await screen.findByTestId("records-no-match", {}, { timeout: 2000 })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(await screen.findByTestId("records-empty", {}, { timeout: 2000 })).toBeVisible();

    useRecordsMock.mockReturnValue(queryResult({ isError: true, error: new Error("unavailable") }));
    rerender(<RecordsTable zoneId="Z1" />);
    expect(screen.getByTestId("records-error")).toHaveTextContent("Retry");
  });
});
