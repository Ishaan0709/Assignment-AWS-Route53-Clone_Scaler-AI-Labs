import { describe, expect, it } from "vitest";
import { pluralize } from "@/lib/format";

describe("pluralize", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralize(1, "record")).toBe("1 record");
  });

  it("uses the plural otherwise", () => {
    expect(pluralize(0, "record")).toBe("0 records");
    expect(pluralize(3, "record")).toBe("3 records");
  });

  it("accepts an irregular plural", () => {
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});
