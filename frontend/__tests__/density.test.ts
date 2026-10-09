import { describe, expect, it } from "vitest";
import { isDensityMode } from "@/lib/density";

describe("isDensityMode", () => {
  it("accepts the two persisted values", () => {
    expect(isDensityMode("comfortable")).toBe(true);
    expect(isDensityMode("compact")).toBe(true);
    expect(isDensityMode("dense")).toBe(false);
  });
});
