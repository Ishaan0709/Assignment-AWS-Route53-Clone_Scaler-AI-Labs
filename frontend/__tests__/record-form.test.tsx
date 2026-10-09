import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordForm } from "@/components/records/RecordForm";
import { renderWithProviders } from "./helpers";

function withinSelect(testId: string) {
  return within(screen.getByTestId(testId)).getByRole("button");
}

describe("RecordForm", () => {
  it("updates the value example when the type changes and blocks an invalid A record", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <RecordForm
        zoneName="example.com."
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Example: 192.0.2.1/)).toBeInTheDocument();
    await userEvent.click(withinSelect("record-type-0"));
    await userEvent.click(await screen.findByRole("option", { name: "MX" }));
    expect(screen.getByText(/Example: 10 mail.example.com/)).toBeInTheDocument();

    await userEvent.click(withinSelect("record-type-0"));
    await userEvent.click(await screen.findByRole("option", { name: "A" }));
    const textarea = screen.getByTestId("record-values-0").querySelector("textarea");
    if (!textarea) throw new Error("Value textarea missing");
    await userEvent.type(textarea, "not-an-ip");
    await userEvent.click(screen.getByTestId("record-form-submit"));
    expect(await screen.findByText(/not a valid IPv4 address/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hides TTL and value when alias is on, and submits the alias target", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <RecordForm
        zoneName="example.com."
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Alias/ }));
    expect(screen.queryByTestId("record-values-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("record-ttl-0")).not.toBeInTheDocument();
    const name = screen.getByTestId("record-name-0").querySelector("input");
    if (!name) throw new Error("Name input missing");
    await userEvent.type(name, "cdn");
    await userEvent.click(withinSelect("record-alias-target-0"));
    await userEvent.click(await screen.findByRole("option", { name: /CloudFront/ }));
    await userEvent.click(screen.getByTestId("record-form-submit"));
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "cdn",
        type: "A",
        is_alias: true,
        alias_target: "d111111abcdef8.cloudfront.net.",
        ttl: null,
        values: [],
      }),
    ]);
  });

  it("adds a second record for the batch create", async () => {
    renderWithProviders(
      <RecordForm
        zoneName="example.com."
        mode="create"
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByTestId("add-record"));
    expect(screen.getByTestId("record-name-1")).toBeInTheDocument();
    expect(screen.getByTestId("remove-record-1")).toBeInTheDocument();
  });
});
