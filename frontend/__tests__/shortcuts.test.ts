import { describe, expect, it } from "vitest";
import { decideShortcut, type ShortcutInput } from "@/lib/shortcuts";

function input(overrides: Partial<ShortcutInput> = {}): ShortcutInput {
  return {
    key: "c",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    typing: false,
    modalOpen: false,
    helpOpen: false,
    path: "/hostedzones",
    pendingG: false,
    ...overrides,
  };
}

describe("decideShortcut", () => {
  it("creates a zone from the list and a record from a zone", () => {
    expect(decideShortcut(input()).action).toEqual({
      type: "create",
      href: "/hostedzones/create",
    });
    expect(decideShortcut(input({ path: "/hostedzones/Z1" })).action).toEqual({
      type: "create",
      href: "/hostedzones/Z1/records/create",
    });
    expect(decideShortcut(input({ path: "/dashboard" })).action).toBeNull();
  });

  it("focuses the filter, opens help, and goes to hosted zones after g", () => {
    expect(decideShortcut(input({ key: "/" })).action).toEqual({ type: "focus-filter" });
    expect(decideShortcut(input({ key: "?" })).action).toEqual({ type: "help" });
    expect(decideShortcut(input({ key: "g" }))).toEqual({ action: null, pendingG: true });
    expect(decideShortcut(input({ key: "h", pendingG: true })).action).toEqual({
      type: "navigate",
      href: "/hostedzones",
    });
  });

  it("ignores keys while typing or while a dialog is open", () => {
    expect(decideShortcut(input({ typing: true })).action).toBeNull();
    expect(decideShortcut(input({ modalOpen: true, key: "/" })).action).toBeNull();
    expect(decideShortcut(input({ key: "Escape", helpOpen: true })).action).toEqual({
      type: "close",
    });
    expect(decideShortcut(input({ key: "Escape", modalOpen: true })).action).toBeNull();
  });
});
