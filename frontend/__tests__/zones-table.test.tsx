import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZonesTable } from "@/components/zones/ZonesTable";
import { queryToParams } from "@/components/zones/zoneColumns";
import type * as ZonesModule from "@/hooks/useZones";
import { makeZone, renderWithProviders } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/hostedzones",
}));

const useZonesMock = vi.fn();
vi.mock("@/hooks/useZones", async (importOriginal) => {
  const actual = await importOriginal<typeof ZonesModule>();
  return { ...actual, useZones: (...args: unknown[]) => useZonesMock(...args) };
});

type ZonesResult = ReturnType<typeof ZonesModule.useZones>;

function queryResult(overrides: Partial<ZonesResult>): ZonesResult {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ZonesResult;
}

function renderTable(selected: ReturnType<typeof makeZone> | null = null) {
  const onSelectionChange = vi.fn();
  const utils = renderWithProviders(
    <ZonesTable
      selectedZone={selected}
      onSelectionChange={onSelectionChange}
      actions={<button type="button">Create hosted zone</button>}
      emptyAction={<button type="button">Create hosted zone (empty)</button>}
    />,
  );
  return { onSelectionChange, ...utils };
}

beforeEach(() => {
  useZonesMock.mockReset();
  window.localStorage.clear();
});

describe("ZonesTable", () => {
  it("renders zones with the console columns and the count badge", () => {
    useZonesMock.mockReturnValue(
      queryResult({
        data: {
          items: [
            makeZone(),
            makeZone({
              id: "ZPRIVATE0000000000001",
              name: "internal.local.",
              type: "private",
              description: null,
              record_count: 17,
            }),
          ],
          total: 2,
          page: 1,
          page_size: 10,
        },
      }),
    );

    renderTable();

    expect(screen.getByRole("heading", { name: /Hosted zones/ })).toHaveTextContent("(2)");
    const table = screen.getByRole("grid");
    expect(within(table).getByRole("link", { name: "example.com" })).toHaveAttribute(
      "href",
      "/hostedzones/Z0123456789ABCDEFGHIJ",
    );
    expect(within(table).getByText("internal.local")).toBeInTheDocument();
    expect(within(table).getAllByText("Public")).toHaveLength(1);
    expect(within(table).getByText("Private")).toBeInTheDocument();
    expect(within(table).getByText("17")).toBeInTheDocument();
    expect(within(table).getByText("Primary marketing site")).toBeInTheDocument();
    for (const header of [
      "Hosted zone name",
      "Type",
      "Created by",
      "Record count",
      "Description",
      "Hosted zone ID",
    ]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(header) })).toBeVisible();
    }
  });

  it("requests the backend with server-side paging and sorting defaults", () => {
    useZonesMock.mockReturnValue(queryResult({ isPending: true }));
    renderTable();
    expect(useZonesMock).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 10,
      sort: "name",
      order: "asc",
    });
  });

  it("reports the selected row through onSelectionChange", async () => {
    const zone = makeZone();
    useZonesMock.mockReturnValue(
      queryResult({ data: { items: [zone], total: 1, page: 1, page_size: 10 } }),
    );
    const { onSelectionChange } = renderTable();

    await userEvent.click(screen.getByRole("radio", { name: zone.name }));

    expect(onSelectionChange).toHaveBeenCalledWith(zone);
  });

  it("shows the empty state with the create action when there are no zones", () => {
    useZonesMock.mockReturnValue(
      queryResult({ data: { items: [], total: 0, page: 1, page_size: 10 } }),
    );
    renderTable();
    expect(screen.getByTestId("zones-empty")).toHaveTextContent("No hosted zones");
    expect(screen.getByRole("button", { name: "Create hosted zone (empty)" })).toBeVisible();
  });

  it("shows the error state and retries", async () => {
    const refetch = vi.fn();
    useZonesMock.mockReturnValue(
      queryResult({ isError: true, error: new Error("Backend unreachable"), refetch }),
    );
    renderTable();

    expect(screen.getByTestId("zones-error")).toHaveTextContent("Backend unreachable");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the loading text while the first page loads", () => {
    useZonesMock.mockReturnValue(queryResult({ isPending: true }));
    renderTable();
    expect(screen.getByText("Loading hosted zones")).toBeInTheDocument();
  });

  it("shows the no-match state with Clear filter after a free-text search", async () => {
    useZonesMock.mockReturnValue(
      queryResult({ data: { items: [], total: 0, page: 1, page_size: 10 } }),
    );
    renderTable();

    await userEvent.type(
      screen.getByPlaceholderText("Filter hosted zones by property or value"),
      "nothing-here",
    );
    // jsdom cannot position the autosuggest dropdown, so pick the "Use: …"
    // free-text option explicitly instead of pressing Enter.
    await userEvent.click(screen.getByRole("option", { name: /nothing-here/ }));

    // The filter is debounced (300 ms) before it reaches the query.
    expect(await screen.findByTestId("zones-no-match", {}, { timeout: 2000 })).toHaveTextContent(
      "No matches",
    );
    expect(useZonesMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "nothing-here" }));

    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(await screen.findByTestId("zones-empty", {}, { timeout: 2000 })).toBeInTheDocument();
  });
});

describe("queryToParams", () => {
  it("maps property tokens to backend parameters and the rest to q", () => {
    expect(
      queryToParams({
        operation: "and",
        tokens: [
          { propertyKey: "type", operator: "=", value: "Private" },
          { propertyKey: "name", operator: ":", value: "Example" },
          { propertyKey: "description", operator: ":", value: "shop" },
          { propertyKey: "id", operator: "=", value: "Z123" },
          { operator: ":", value: "free" },
        ],
      }),
    ).toEqual({ type: "private", name: "example", q: "shop Z123 free" });
  });

  it("ignores blank and unknown type values", () => {
    expect(
      queryToParams({
        operation: "or",
        tokens: [
          { propertyKey: "type", operator: "=", value: "weird" },
          { operator: ":", value: "   " },
        ],
      }),
    ).toEqual({});
  });
});
