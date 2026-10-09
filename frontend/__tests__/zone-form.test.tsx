import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ZoneForm } from "@/components/zones/ZoneForm";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "./helpers";

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onCancel = vi.fn();
  renderWithProviders(<ZoneForm onSubmit={onSubmit} onCancel={onCancel} submitting={false} />);
  return { onSubmit, onCancel };
}

const submitButton = () => screen.getByRole("button", { name: "Create hosted zone" });
const nameInput = () => screen.getByRole("textbox", { name: "Domain name" });

describe("ZoneForm", () => {
  it("shows inline validation for an invalid domain and does not submit", async () => {
    const { onSubmit } = renderForm();
    await userEvent.click(submitButton());
    expect(screen.getByText("Domain name is required.")).toBeVisible();

    await userEvent.type(nameInput(), "localhost");
    expect(
      screen.getByText(
        "Enter a fully qualified domain name with at least two labels, e.g. example.com.",
      ),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a normalized public zone payload", async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(nameInput(), "  Example.COM. ");
    await userEvent.type(screen.getByRole("textbox", { name: /Description/ }), "Marketing site");
    await userEvent.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "example.com",
      type: "public",
      description: "Marketing site",
      vpc_id: null,
      vpc_region: null,
      tags: [],
    });
  });

  it("reveals the VPC section for private zones and requires region and VPC", async () => {
    const { onSubmit } = renderForm();
    expect(screen.queryByTestId("zone-vpc-section")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Private hosted zone" }));
    expect(screen.getByTestId("zone-vpc-section")).toBeVisible();

    await userEvent.type(nameInput(), "internal.local");
    await userEvent.click(submitButton());
    expect(screen.getByText("Choose the region of the VPC to associate.")).toBeVisible();
    expect(
      screen.getByText("Choose a VPC to associate with the private hosted zone."),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("adds and removes tag rows up to the limit text", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Add new tag" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Tag 1 key" }), "Environment");
    await userEvent.type(screen.getByRole("textbox", { name: "Tag 1 value" }), "prod");
    expect(screen.getByText("You can add up to 49 more tags.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("You can add up to 50 more tags.")).toBeInTheDocument();
  });

  it("flags duplicate tag keys before submitting", async () => {
    const { onSubmit } = renderForm();
    await userEvent.type(nameInput(), "example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add new tag" }));
    await userEvent.click(screen.getByRole("button", { name: "Add new tag" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Tag 1 key" }), "Env");
    await userEvent.type(screen.getByRole("textbox", { name: "Tag 2 key" }), "Env");
    await userEvent.click(submitButton());

    expect(screen.getByText("Duplicate tag key 'Env'.")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("maps server field errors (409 duplicate) onto the domain name field", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(
        409,
        "HostedZoneAlreadyExists",
        "A public hosted zone named example.com already exists.",
        {
          name: "A hosted zone with this name already exists.",
        },
      ),
    );
    renderForm(onSubmit);
    await userEvent.type(nameInput(), "example.com");
    await userEvent.click(submitButton());

    expect(await screen.findByText("A hosted zone with this name already exists.")).toBeVisible();
    const form = screen.getByTestId("zone-form");
    expect(within(form).queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("shows unexpected errors at the form level", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Could not reach the server."));
    renderForm(onSubmit);
    await userEvent.type(nameInput(), "example.com");
    await userEvent.click(submitButton());
    expect(await screen.findByText("Could not reach the server.")).toBeVisible();
  });

  it("calls onCancel", async () => {
    const { onCancel } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
