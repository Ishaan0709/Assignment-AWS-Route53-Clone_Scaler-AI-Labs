import { describe, expect, it } from "vitest";
import { importTypeBreakdown } from "@/lib/importPreview";

describe("importTypeBreakdown", () => {
  it("counts only records the dry run would create", () => {
    expect(
      importTypeBreakdown([
        { type: "A", status: "new" },
        { type: "CNAME", status: "new" },
        { type: "A", status: "new" },
        { type: "SOA", status: "skipped" },
        { type: "TXT", status: "error" },
      ]),
    ).toBe("2 A, 1 CNAME");
  });

  it("is empty when nothing would be created", () => {
    expect(importTypeBreakdown([{ type: "NS", status: "skipped" }])).toBe("");
  });
});
