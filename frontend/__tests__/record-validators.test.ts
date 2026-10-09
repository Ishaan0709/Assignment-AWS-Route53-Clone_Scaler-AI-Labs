import { describe, expect, it } from "vitest";
import {
  canonicalIpv6,
  normalizeRecordName,
  validateAlias,
  validateComment,
  validateRouting,
  validateTtl,
  validateValues,
} from "@/lib/recordValidators";

const ZONE = "example.com.";

describe("normalizeRecordName", () => {
  it.each([
    ["", ZONE],
    ["@", ZONE],
    ["example.com", ZONE],
    ["example.com.", ZONE],
    ["www", "www.example.com."],
    ["WWW", "www.example.com."],
    ["www.example.com", "www.example.com."],
    ["www.example.com.", "www.example.com."],
    ["other.com", "other.com.example.com."],
    ["_dmarc", "_dmarc.example.com."],
    ["_sip._tcp", "_sip._tcp.example.com."],
    ["*", "*.example.com."],
    ["*.staging", "*.staging.example.com."],
    ["a.b.c", "a.b.c.example.com."],
  ])("accepts %j", (raw, expected) => {
    const result = normalizeRecordName(raw, ZONE);
    expect(result.ok && result.value).toBe(expected);
  });

  it.each([
    "www.other.com.",
    "notexample.com.",
    "foo.*",
    "a.*.b",
    "-bad",
    "bad-",
    "sp ace",
    "a".repeat(64),
  ])("rejects %j", (raw) => {
    const result = normalizeRecordName(raw, ZONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("name");
  });

  it("tells the user when the name is outside the zone", () => {
    const result = normalizeRecordName("www.other.com.", ZONE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Record name must end with .example.com");
  });
});

describe("canonicalIpv6", () => {
  it("compresses a fully expanded address the way Python does", () => {
    expect(canonicalIpv6("2001:0DB8:0000:0000:0000:0000:0000:0001")).toBe("2001:db8::1");
  });
});

describe("validateValues", () => {
  it.each([
    ["A", ["192.0.2.1"], ["192.0.2.1"]],
    ["A", ["192.0.2.1", " 198.51.100.7 "], ["192.0.2.1", "198.51.100.7"]],
    ["AAAA", ["2001:db8::1"], ["2001:db8::1"]],
    ["AAAA", ["2001:0DB8:0000:0000:0000:0000:0000:0001"], ["2001:db8::1"]],
    ["CNAME", ["Target.Example.com."], ["target.example.com."]],
    ["TXT", ['"v=spf1 -all"'], ['"v=spf1 -all"']],
    ["TXT", ['"part one" "part two"'], ['"part one" "part two"']],
    ["TXT", ["v=spf1 -all"], ['"v=spf1 -all"']],
    ["MX", ["10 mail.example.com."], ["10 mail.example.com."]],
    ["MX", ["65535 mx.example.com"], ["65535 mx.example.com"]],
    ["NS", ["ns1.example.com.", "ns2.example.com."], ["ns1.example.com.", "ns2.example.com."]],
    ["PTR", ["host.example.com."], ["host.example.com."]],
    ["SRV", ["10 5 5060 sip.example.com."], ["10 5 5060 sip.example.com."]],
    ["CAA", ['0 issue "letsencrypt.org"'], ['0 issue "letsencrypt.org"']],
    ["CAA", ['128 ISSUEWILD ";"'], ['128 issuewild ";"']],
    ["CAA", ['0 iodef "mailto:sec@example.com"'], ['0 iodef "mailto:sec@example.com"']],
    [
      "SOA",
      ["ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"],
      ["ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"],
    ],
  ] as const)("accepts %s %j", (rtype, values, expected) => {
    const result = validateValues(rtype, [...values]);
    expect(result.ok && result.value).toEqual([...expected]);
  });

  it("splits a long unquoted TXT value into 255-character strings", () => {
    const raw = "a".repeat(600);
    const result = validateValues("TXT", [raw]);
    expect(result.ok && result.value).toEqual([
      `"${"a".repeat(255)}" "${"a".repeat(255)}" "${"a".repeat(90)}"`,
    ]);
  });

  it.each([
    ["A", ["256.0.0.1"], "IPv4"],
    ["A", ["2001:db8::1"], "IPv4"],
    ["A", ["not-an-ip"], "IPv4"],
    ["AAAA", ["192.0.2.1"], "IPv6"],
    ["AAAA", ["2001:db8::zz"], "IPv6"],
    ["CNAME", ["a.example.com.", "b.example.com."], "exactly one"],
    ["CNAME", ["bad host"], "hostname"],
    ["TXT", [`"${"x".repeat(256)}"`], "255"],
    ["TXT", ['"unterminated'], "double-quoted"],
    ["TXT", ['"ok" trailing'], "double-quoted"],
    ["MX", ["mail.example.com."], "priority"],
    ["MX", ["65536 mail.example.com."], "between 0 and 65535"],
    ["MX", ["-1 mail.example.com."], "between 0 and 65535"],
    ["MX", ["ten mail.example.com."], "integer"],
    ["NS", ["not valid!"], "hostname"],
    ["PTR", ["a.example.com.", "b.example.com."], "exactly one"],
    ["SRV", ["10 5 sip.example.com."], "SRV value"],
    ["SRV", ["10 5 70000 sip.example.com."], "between 0 and 65535"],
    ["CAA", ['issue "letsencrypt.org"'], "CAA value"],
    ["CAA", ['256 issue "letsencrypt.org"'], "between 0 and 255"],
    ["CAA", ['0 bogus "letsencrypt.org"'], "tag"],
    ["CAA", ["0 issue letsencrypt.org"], "double quotes"],
    ["SOA", ["ns.example.com. hostmaster.example.com. 1 7200 900"], "seven fields"],
    ["A", [], "at least one"],
    ["A", ["", "  "], "at least one"],
    ["A", ["192.0.2.1", "192.0.2.1"], "Duplicate"],
  ] as const)("rejects %s %j (%s)", (rtype, values, fragment) => {
    const result = validateValues(rtype, [...values]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain(fragment.toLowerCase());
      expect(result.field).toBe("values");
    }
  });

  it("rejects an unknown record type on the type field", () => {
    const result = validateValues("FOO", ["x"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("type");
  });
});

describe("ttl, routing, alias and comment", () => {
  it.each([
    [null, 300],
    [0, 0],
    [60, 60],
    [2147483647, 2147483647],
  ] as const)("accepts ttl %s", (ttl, expected) => {
    const result = validateTtl(ttl);
    expect(result.ok && result.value).toBe(expected);
  });

  it("rejects a ttl outside the range", () => {
    const result = validateTtl(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("ttl");
  });

  it("drops the identifier on simple routing", () => {
    const result = validateRouting("simple", "ignored", 5);
    expect(result.ok && result.value).toEqual({
      policy: "Simple",
      setIdentifier: null,
      weight: null,
    });
  });

  it("keeps weight for weighted routing and the identifier for the other policies", () => {
    const weighted = validateRouting("Weighted", " blue ", 0);
    expect(weighted.ok && weighted.value).toEqual({
      policy: "Weighted",
      setIdentifier: "blue",
      weight: 0,
    });
    const latency = validateRouting("Latency", "eu", 5);
    expect(latency.ok && latency.value).toEqual({
      policy: "Latency",
      setIdentifier: "eu",
      weight: null,
    });
  });

  it.each([
    ["Weighted", null, 10, "set_identifier"],
    ["Weighted", "blue", null, "weight"],
    ["Weighted", "blue", 256, "weight"],
    ["Latency", null, null, "set_identifier"],
    ["Bogus", "x", null, "routing_policy"],
  ] as const)("rejects routing %s", (policy, identifier, weight, field) => {
    const result = validateRouting(policy, identifier, weight);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe(field);
  });

  it("accepts an alias only for A, AAAA and CNAME", () => {
    const result = validateAlias("A", true, " D111.CloudFront.net. ", [], 300);
    expect(result.ok && result.value).toEqual({
      values: [],
      ttl: null,
      aliasTarget: "d111.cloudfront.net.",
    });
    const rejected = validateAlias("TXT", true, "d111.cloudfront.net.", [], null);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.field).toBe("is_alias");
  });

  it("requires an alias target and forbids values", () => {
    const missing = validateAlias("A", true, "", [], null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.field).toBe("alias_target");
    const both = validateAlias("A", true, "d111.cloudfront.net.", ["192.0.2.1"], null);
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.field).toBe("values");
  });

  it("trims comments and rejects ones that are too long", () => {
    const trimmed = validateComment(" hi ");
    expect(trimmed.ok && trimmed.value).toBe("hi");
    const blank = validateComment("   ");
    expect(blank.ok && blank.value).toBe(null);
    const tooLong = validateComment("x".repeat(257));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.field).toBe("comment");
  });
});
