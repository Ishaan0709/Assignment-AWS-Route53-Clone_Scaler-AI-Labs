import { describe, expect, it } from "vitest";
import {
  domainNameError,
  hasTagErrors,
  normalizeDomainInput,
  tagErrors,
  tagsToApi,
  validateZoneForm,
  type TagRow,
  type ZoneFormValues,
} from "@/lib/validators";

const row = (key: string, value = "", id = key || "blank"): TagRow => ({ id, key, value });

describe("domainNameError (mirrors the backend rules)", () => {
  it.each(["example.com", "Example.COM.", "sub.example.co.uk", "a1-b2.example", "x.y"])(
    "accepts %s",
    (name) => {
      expect(domainNameError(name)).toBeUndefined();
    },
  );

  it.each([
    ["", "Domain name is required."],
    ["   ", "Domain name is required."],
    [
      "localhost",
      "Enter a fully qualified domain name with at least two labels, e.g. example.com.",
    ],
    ["example..com", "Domain name contains an empty label."],
    ["-bad.example.com", "Labels cannot start or end with a hyphen."],
    ["bad-.example.com", "Labels cannot start or end with a hyphen."],
    ["ex_ample.com", "Domain name can only contain lowercase letters, digits, hyphens and dots."],
    ["exa mple.com", "Domain name can only contain lowercase letters, digits, hyphens and dots."],
    [`${"a".repeat(64)}.com`, "Each label must be at most 63 characters."],
    [
      `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`,
      "Domain name must be at most 253 characters.",
    ],
  ])("rejects %j", (name, message) => {
    expect(domainNameError(name)).toBe(message);
  });

  it("normalizes case, whitespace and the trailing dot", () => {
    expect(normalizeDomainInput("  Example.COM. ")).toBe("example.com");
  });
});

describe("tagErrors", () => {
  it("accepts unique keys with optional values", () => {
    const errors = tagErrors([row("Environment", "prod"), row("Team")]);
    expect(hasTagErrors(errors)).toBe(false);
  });

  it("flags duplicate keys on the later row only", () => {
    const errors = tagErrors([row("Env", "a", "1"), row("Env", "b", "2")]);
    expect(errors[0]).toEqual({});
    expect(errors[1]?.key).toBe("Duplicate tag key 'Env'.");
  });

  it("rejects the reserved aws: prefix and overlong keys and values", () => {
    const errors = tagErrors([
      row("aws:cloudformation:stack"),
      row("k".repeat(129)),
      row("ok", "v".repeat(257)),
    ]);
    expect(errors[0]?.key).toBe("Tag keys cannot start with 'aws:'.");
    expect(errors[1]?.key).toBe("Tag key must be at most 128 characters.");
    expect(errors[2]?.value).toBe("Tag value must be at most 256 characters.");
  });

  it("requires a key only when a value was entered", () => {
    expect(tagErrors([row("", "")])[0]).toEqual({});
    expect(tagErrors([row("", "orphan")])[0]?.key).toBe("Tag key is required.");
  });

  it("drops blank rows and trims when converting for the API", () => {
    expect(tagsToApi([row(" Env ", " prod "), row("", ""), row("Team")])).toEqual([
      { key: "Env", value: "prod" },
      { key: "Team", value: "" },
    ]);
  });
});

describe("validateZoneForm", () => {
  const base: ZoneFormValues = {
    name: "example.com",
    description: "",
    type: "public",
    vpcRegion: "",
    vpcId: "",
    tags: [],
  };

  it("passes a valid public zone", () => {
    expect(validateZoneForm(base)).toEqual({});
  });

  it("requires region and VPC for private zones", () => {
    expect(validateZoneForm({ ...base, type: "private" })).toEqual({
      vpcRegion: "Choose the region of the VPC to associate.",
      vpcId: "Choose a VPC to associate with the private hosted zone.",
    });
  });

  it("caps the description at 256 characters", () => {
    expect(validateZoneForm({ ...base, description: "d".repeat(257) }).description).toBe(
      "Description must be at most 256 characters.",
    );
  });
});
