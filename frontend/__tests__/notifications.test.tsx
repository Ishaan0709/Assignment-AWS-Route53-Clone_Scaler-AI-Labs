import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "@/components/common/NotificationProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { NOTIFICATION_TTL_MS } from "@/lib/constants";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NotificationProvider>{children}</NotificationProvider>
);

function setup() {
  return renderHook(() => useNotifications(), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNotifications", () => {
  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useNotifications())).toThrow(/NotificationProvider/);
  });

  it("adds success, error and info notifications that are dismissible", () => {
    const { result } = setup();

    act(() => {
      result.current.success("Created", "example.com was successfully created.");
      result.current.error("Failed");
      result.current.info("Signed out");
    });

    expect(result.current.items.map((item) => item.type)).toEqual(["info", "error", "success"]);
    expect(result.current.flashItems).toHaveLength(3);
    for (const flash of result.current.flashItems) {
      expect(flash.dismissible).toBe(true);
      expect(typeof flash.onDismiss).toBe("function");
    }
    expect(result.current.flashItems[2]).toMatchObject({
      type: "success",
      header: "Created",
      content: "example.com was successfully created.",
    });
  });

  it("stacks notifications newest first and returns their ids", () => {
    const { result } = setup();
    let first = "";
    let second = "";

    act(() => {
      first = result.current.info("First");
      second = result.current.info("Second");
    });

    expect(first).not.toBe(second);
    expect(result.current.items.map((item) => item.id)).toEqual([second, first]);
  });

  it("dismisses a notification by id", () => {
    const { result } = setup();
    let id = "";

    act(() => {
      id = result.current.success("Done");
      result.current.success("Keep me");
    });
    act(() => {
      result.current.dismiss(id);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.header).toBe("Keep me");
  });

  it("dismisses through the Flashbar onDismiss callback", () => {
    const { result } = setup();

    act(() => {
      result.current.warning("Careful");
    });
    act(() => {
      result.current.flashItems[0]?.onDismiss?.(new CustomEvent("dismiss"));
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("auto-dismisses after about 8 seconds", () => {
    const { result } = setup();

    act(() => {
      result.current.success("Saved");
    });
    expect(result.current.items).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(NOTIFICATION_TTL_MS - 1);
    });
    expect(result.current.items).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("keeps notifications with ttl null until dismissed", () => {
    const { result } = setup();

    act(() => {
      result.current.error("Sticky", undefined, { ttl: null });
    });
    act(() => {
      vi.advanceTimersByTime(NOTIFICATION_TTL_MS * 5);
    });

    expect(result.current.items).toHaveLength(1);
  });

  it("replaces a notification in place when the same id is reused", () => {
    const { result } = setup();

    act(() => {
      result.current.add("in-progress", "Deleting…", undefined, { id: "job" });
    });
    act(() => {
      result.current.success("Deleted", "3 records deleted", { id: "job" });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      id: "job",
      type: "success",
      header: "Deleted",
    });
  });

  it("clears everything", () => {
    const { result } = setup();

    act(() => {
      result.current.info("One");
      result.current.info("Two");
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.items).toHaveLength(0);
  });
});
