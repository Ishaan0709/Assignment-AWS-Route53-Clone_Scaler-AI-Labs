import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteZoneModal, hasNonDefaultRecords } from "@/components/zones/DeleteZoneModal";
import { EditZoneModal } from "@/components/zones/EditZoneModal";
import type * as ApiModule from "@/lib/api";
import { makeZone, renderWithProviders } from "./helpers";

const apiMock = vi.hoisted(() => ({
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, delete: apiMock.delete, put: apiMock.put } };
});

beforeEach(() => {
  apiMock.delete.mockReset();
  apiMock.put.mockReset();
});

describe("DeleteZoneModal", () => {
  it("treats more than the two default records as non-empty", () => {
    expect(hasNonDefaultRecords(makeZone({ record_count: 2 }))).toBe(false);
    expect(hasNonDefaultRecords(makeZone({ record_count: 3 }))).toBe(true);
  });

  it("blocks deletion of a zone with user records", () => {
    renderWithProviders(
      <DeleteZoneModal zone={makeZone({ record_count: 26 })} onDismiss={vi.fn()} />,
    );
    expect(screen.getByTestId("delete-zone-blocked")).toHaveTextContent(
      "contains 24 records other than the default NS and SOA records",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.queryByTestId("delete-zone-confirmation")).not.toBeInTheDocument();
  });

  it("requires typing delete, then deletes and reports back", async () => {
    apiMock.delete.mockResolvedValue(undefined);
    const onDismiss = vi.fn();
    const onDeleted = vi.fn();
    const zone = makeZone({ record_count: 2 });
    renderWithProviders(
      <DeleteZoneModal zone={zone} onDismiss={onDismiss} onDeleted={onDeleted} />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    expect(deleteButton).toBeDisabled();

    const input = screen.getByRole("textbox", { name: "Type delete to confirm" });
    await userEvent.type(input, "del");
    expect(deleteButton).toBeDisabled();
    await userEvent.type(input, "ete");
    expect(deleteButton).toBeEnabled();

    await userEvent.click(deleteButton);
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(zone));
    expect(apiMock.delete).toHaveBeenCalledWith(`/api/hostedzones/${zone.id}`, { force: false });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows the server error when deletion fails", async () => {
    apiMock.delete.mockRejectedValue(new Error("The hosted zone contains records."));
    renderWithProviders(<DeleteZoneModal zone={makeZone()} onDismiss={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Type delete to confirm" }), "delete");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("The hosted zone contains records.")).toBeVisible();
  });

  it("calls onDismiss from Cancel", async () => {
    const onDismiss = vi.fn();
    renderWithProviders(<DeleteZoneModal zone={makeZone()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("EditZoneModal", () => {
  it("shows name and type read-only and saves description and tags", async () => {
    const zone = makeZone({ tags: [{ key: "Environment", value: "production" }] });
    apiMock.put.mockResolvedValue({ ...zone, description: "Updated" });
    const onDismiss = vi.fn();
    const onSaved = vi.fn();
    renderWithProviders(<EditZoneModal zone={zone} onDismiss={onDismiss} onSaved={onSaved} />);

    expect(screen.getByRole("heading", { name: "Edit hosted zone" })).toBeVisible();
    expect(screen.getByText("example.com")).toBeVisible();
    expect(screen.getByText("Public hosted zone")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Domain name" })).not.toBeInTheDocument();

    const description = screen.getByRole("textbox", { name: /Description/ });
    await userEvent.clear(description);
    await userEvent.type(description, "Updated");
    await userEvent.click(screen.getByRole("button", { name: "Add new tag" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Tag 2 key" }), "Team");
    await userEvent.type(screen.getByRole("textbox", { name: "Tag 2 value" }), "web");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(apiMock.put).toHaveBeenCalledWith(`/api/hostedzones/${zone.id}`, {
      description: "Updated",
      tags: [
        { key: "Environment", value: "production" },
        { key: "Team", value: "web" },
      ],
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("rejects an over-long description without calling the API", async () => {
    renderWithProviders(<EditZoneModal zone={makeZone()} onDismiss={vi.fn()} />);
    const description = screen.getByRole("textbox", { name: /Description/ });
    await userEvent.clear(description);
    await userEvent.paste("x".repeat(257));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Description must be at most 256 characters.")).toBeVisible();
    expect(apiMock.put).not.toHaveBeenCalled();
  });
});
