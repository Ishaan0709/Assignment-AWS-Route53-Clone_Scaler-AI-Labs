/**
 * Client-side record rules. Message text and acceptance match
 * `backend/app/services/validators.py` and `domain.normalize_record_name` so a
 * value the form accepts is a value the API accepts.
 */

export const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
  "NS",
  "PTR",
  "SRV",
  "CAA",
  "SOA",
] as const;

export const ROUTING_POLICIES = [
  "Simple",
  "Weighted",
  "Latency",
  "Failover",
  "Geolocation",
  "Multivalue",
] as const;

export const ALIAS_TYPES = ["A", "AAAA", "CNAME"] as const;
export const SINGLE_VALUE_TYPES = ["CNAME", "PTR", "SOA"] as const;
export const CAA_TAGS = ["issue", "issuewild", "iodef"] as const;

export const DEFAULT_TTL = 300;
export const MIN_TTL = 0;
export const MAX_TTL = 2_147_483_647;
export const MAX_VALUES = 100;
export const TXT_MAX_STRING = 255;
export const TXT_MAX_TOTAL = 4000;
export const MAX_SET_IDENTIFIER = 128;
export const MAX_WEIGHT = 255;
export const MAX_COMMENT = 256;
export const MAX_LABEL = 63;
export const MAX_DOMAIN = 253;
export const MAX_RECORD_NAME = 255;
export const MAX_HEALTH_CHECK_ID = 64;

const UINT16_MAX = 65_535;
const UINT32_MAX = 4_294_967_295;

const RECORD_LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;

export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export interface ValidationErr {
  ok: false;
  field: string;
  message: string;
}

export type Validation<T> = ValidationOk<T> | ValidationErr;

export function ok<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

export function err(message: string, field = "values"): ValidationErr {
  return { ok: false, field, message };
}

export function stripDot(name: string): string {
  return name.endsWith(".") ? name.slice(0, -1) : name;
}

export function ensureDot(name: string): string {
  return name.endsWith(".") ? name : `${name}.`;
}

export function isValidHostname(value: string): boolean {
  const host = stripDot(value.trim().toLowerCase());
  if (!host || host.length > MAX_DOMAIN) return false;
  return host.split(".").every((label) => label.length <= MAX_LABEL && RECORD_LABEL.test(label));
}

export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase();
}

function hostname(token: string, what: string): Validation<string> {
  if (!isValidHostname(token)) {
    return err(`${what} must be a valid hostname, e.g. mail.example.com.`);
  }
  return ok(normalizeHostname(token));
}

/** Record name within a zone. `field` messages match the API `fields` map. */
export function normalizeRecordName(raw: string, zoneName: string): Validation<string> {
  const zone = ensureDot(zoneName.toLowerCase());
  const zoneBare = stripDot(zone);
  const name = raw.trim().toLowerCase();

  if (name === "" || name === "@" || name === zone || name === zoneBare) return ok(zone);

  let fqdn: string;
  if (name.endsWith(".")) fqdn = name;
  else if (name === zoneBare || name.endsWith(`.${zoneBare}`)) fqdn = `${name}.`;
  else fqdn = `${name}.${zone}`;

  if (fqdn !== zone && !fqdn.endsWith(`.${zone}`)) {
    return err(`Record name must end with .${zoneBare}`, "name");
  }
  if (fqdn.length > MAX_RECORD_NAME) return err("Record name is too long.", "name");

  const relative = fqdn === zone ? "" : fqdn.slice(0, -(zone.length + 1));
  const labels = relative ? relative.split(".") : [];
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? "";
    if (label === "*") {
      if (index !== 0) return err("A wildcard (*) is only allowed as the leftmost label.", "name");
      continue;
    }
    if (!label || label.length > MAX_LABEL || !RECORD_LABEL.test(label)) {
      return err(
        "Labels must be 1-63 characters of letters, digits, hyphens or underscores and cannot start or end with a hyphen.",
        "name",
      );
    }
  }
  return ok(fqdn);
}

function intInRange(token: string, lo: number, hi: number, what: string): Validation<number> {
  if (!/^-?\d+$/.test(token)) return err(`${what} must be an integer between ${lo} and ${hi}.`);
  const number = Number(token);
  if (!Number.isSafeInteger(number) || number < lo || number > hi) {
    return err(`${what} must be between ${lo} and ${hi}.`);
  }
  return ok(number);
}

function validateA(value: string): Validation<string> {
  const parts = value.split(".");
  if (parts.length !== 4) return err(`'${value}' is not a valid IPv4 address.`);
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part) || (part.length > 1 && part.startsWith("0"))) {
      return err(`'${value}' is not a valid IPv4 address.`);
    }
    const octet = Number(part);
    if (octet > 255) return err(`'${value}' is not a valid IPv4 address.`);
    octets.push(octet);
  }
  return ok(octets.join("."));
}

function parseIpv4Tail(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  const a = octets[0];
  const b = octets[1];
  const c = octets[2];
  const d = octets[3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return [a, b, c, d];
}

function formatIpv6(hextets: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  let runLen = 0;
  for (let index = 0; index < hextets.length; index += 1) {
    if (hextets[index] === 0) {
      if (runStart < 0) runStart = index;
      runLen += 1;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
      runLen = 0;
    }
  }
  const hex = hextets.map((part) => part.toString(16));
  if (bestLen > 1) {
    const left = hex.slice(0, bestStart).join(":");
    const right = hex.slice(bestStart + bestLen).join(":");
    return `${left}::${right}`;
  }
  return hex.join(":");
}

/** Canonical text of an IPv6 address, matching Python's `ipaddress.IPv6Address`. */
export function canonicalIpv6(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.includes("%")) return null;

  let head = raw;
  const dotted = raw.lastIndexOf(".");
  if (dotted !== -1) {
    const lastColon = raw.lastIndexOf(":");
    if (lastColon === -1 || lastColon > dotted) return null;
    const tail = parseIpv4Tail(raw.slice(lastColon + 1));
    if (!tail) return null;
    const [a, b, c, d] = tail;
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    head = `${raw.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const sides = head.split("::");
  if (sides.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const groups = side.split(":");
    const numbers: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      numbers.push(Number.parseInt(group, 16));
    }
    return numbers;
  };

  const left = parseSide(sides[0] ?? "");
  if (!left) return null;
  const right = sides.length === 2 ? parseSide(sides[1] ?? "") : [];
  if (!right) return null;
  if (sides.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (sides.length === 2 && missing < 1) return null;
  const zeros = sides.length === 2 ? Array<number>(missing).fill(0) : [];
  const hextets = [...left, ...zeros, ...right];
  if (hextets.length !== 8) return null;

  const mapped =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff;
  if (mapped) {
    const hi = hextets[6] ?? 0;
    const lo = hextets[7] ?? 0;
    return `::ffff:${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return formatIpv6(hextets);
}

function validateAaaa(value: string): Validation<string> {
  const canonical = canonicalIpv6(value);
  if (!canonical) return err(`'${value}' is not a valid IPv6 address.`);
  return ok(canonical);
}

function validateMx(value: string): Validation<string> {
  const parts = value.split(/\s+/);
  if (parts.length !== 2) {
    return err("MX value must be '<priority> <mail server>', e.g. 10 mail.example.com.");
  }
  const priority = intInRange(parts[0] ?? "", 0, UINT16_MAX, "MX priority");
  if (!priority.ok) return priority;
  const host = hostname(parts[1] ?? "", "MX mail server");
  if (!host.ok) return host;
  return ok(`${priority.value} ${host.value}`);
}

function validateSrv(value: string): Validation<string> {
  const parts = value.split(/\s+/);
  if (parts.length !== 4) {
    return err(
      "SRV value must be '<priority> <weight> <port> <target>', e.g. 10 5 5060 sip.example.com.",
    );
  }
  const priority = intInRange(parts[0] ?? "", 0, UINT16_MAX, "SRV priority");
  if (!priority.ok) return priority;
  const weight = intInRange(parts[1] ?? "", 0, UINT16_MAX, "SRV weight");
  if (!weight.ok) return weight;
  const port = intInRange(parts[2] ?? "", 0, UINT16_MAX, "SRV port");
  if (!port.ok) return port;
  const target = hostname(parts[3] ?? "", "SRV target");
  if (!target.ok) return target;
  return ok(`${priority.value} ${weight.value} ${port.value} ${target.value}`);
}

/** Split on whitespace at most `splits` times, keeping the tail intact (Python `maxsplit`). */
function splitMax(value: string, splits: number): string[] {
  const parts: string[] = [];
  let rest = value.trim();
  for (let index = 0; index < splits; index += 1) {
    const match = /^(\S+)\s+([\s\S]*)$/.exec(rest);
    const token = match?.[1];
    const tail = match?.[2];
    if (token === undefined || tail === undefined) {
      if (rest) parts.push(rest);
      return parts;
    }
    parts.push(token);
    rest = tail.trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function validateCaa(value: string): Validation<string> {
  const parts = splitMax(value, 2);
  if (parts.length !== 3) {
    return err('CAA value must be \'<flags> <tag> "<value>"\', e.g. 0 issue "letsencrypt.org".');
  }
  const flags = intInRange(parts[0] ?? "", 0, 255, "CAA flags");
  if (!flags.ok) return flags;
  const tag = (parts[1] ?? "").toLowerCase();
  if (!(CAA_TAGS as readonly string[]).includes(tag)) {
    return err(`CAA tag must be one of: ${CAA_TAGS.join(", ")}.`);
  }
  const quoted = (parts[2] ?? "").trim();
  if (quoted.length < 2 || !quoted.startsWith('"') || !quoted.endsWith('"')) {
    return err("CAA value must be wrapped in double quotes.");
  }
  return ok(`${flags.value} ${tag} ${quoted}`);
}

function validateSoa(value: string): Validation<string> {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 7) {
    return err(
      "SOA value must have seven fields: primary name server, admin email, serial, refresh, retry, expire, minimum.",
    );
  }
  const primary = hostname(parts[0] ?? "", "SOA primary name server");
  if (!primary.ok) return primary;
  const admin = hostname(parts[1] ?? "", "SOA admin email");
  if (!admin.ok) return admin;
  const names = ["Serial", "Refresh", "Retry", "Expire", "Minimum"] as const;
  const numbers: string[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const parsed = intInRange(parts[index + 2] ?? "", 0, UINT32_MAX, names[index] ?? "SOA field");
    if (!parsed.ok) return parsed;
    numbers.push(String(parsed.value));
  }
  return ok([primary.value, admin.value, ...numbers].join(" "));
}

function splitTxtStrings(value: string): string[] | null {
  const stripped = value.trim();
  if (!stripped.startsWith('"')) return null;
  const strings: string[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"/y;
  let pos = 0;
  while (pos < stripped.length) {
    pattern.lastIndex = pos;
    const match = pattern.exec(stripped);
    if (!match) return null;
    strings.push(match[1] ?? "");
    pos = pattern.lastIndex;
    while (pos < stripped.length && stripped[pos] === " ") pos += 1;
  }
  return strings;
}

function chunk(text: string, size: number): string[] {
  if (text.length === 0) return [""];
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size)
    parts.push(text.slice(index, index + size));
  return parts;
}

function validateTxt(value: string): Validation<string> {
  let strings = splitTxtStrings(value);
  if (strings === null) {
    if (value.includes('"')) {
      return err(
        'TXT value must be one or more double-quoted strings, e.g. "v=spf1 include:_spf.example.com ~all".',
      );
    }
    strings = chunk(value.trim().replaceAll("\\", "\\\\").replaceAll('"', '\\"'), TXT_MAX_STRING);
  }
  for (const string of strings) {
    if (string.length > TXT_MAX_STRING) {
      return err(
        `Each quoted TXT string must be at most ${TXT_MAX_STRING} characters; split longer text into several strings: "part one" "part two".`,
      );
    }
  }
  return ok(strings.map((string) => `"${string}"`).join(" "));
}

function validateHostnameValue(value: string): Validation<string> {
  return hostname(value, "Value");
}

const VALUE_VALIDATORS: Record<string, (value: string) => Validation<string>> = {
  A: validateA,
  AAAA: validateAaaa,
  CNAME: validateHostnameValue,
  TXT: validateTxt,
  MX: validateMx,
  NS: validateHostnameValue,
  PTR: validateHostnameValue,
  SRV: validateSrv,
  CAA: validateCaa,
  SOA: validateSoa,
};

export function validateRecordType(recordType: string): Validation<string> {
  const rtype = recordType.trim().toUpperCase();
  if (!(RECORD_TYPES as readonly string[]).includes(rtype)) {
    return err(`Unsupported record type '${recordType}'.`, "type");
  }
  return ok(rtype);
}

export function validateValues(
  recordType: string,
  values: readonly string[],
): Validation<string[]> {
  const rtype = validateRecordType(recordType);
  if (!rtype.ok) return rtype;
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (cleaned.length === 0) return err("Enter at least one value.");
  if (cleaned.length > MAX_VALUES) return err(`A record can have at most ${MAX_VALUES} values.`);
  if ((SINGLE_VALUE_TYPES as readonly string[]).includes(rtype.value) && cleaned.length !== 1) {
    return err(`${rtype.value} records must have exactly one value.`);
  }
  const validator = VALUE_VALIDATORS[rtype.value];
  if (!validator) return err(`Unsupported record type '${recordType}'.`, "type");
  const normalized: string[] = [];
  for (const value of cleaned) {
    const result = validator(value);
    if (!result.ok) return result;
    normalized.push(result.value);
  }
  if (rtype.value === "TXT") {
    const total = normalized.reduce((sum, value) => sum + value.length, 0);
    if (total > TXT_MAX_TOTAL)
      return err(`TXT values must total at most ${TXT_MAX_TOTAL} characters.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    return err("Duplicate values are not allowed in the same record.");
  }
  return ok(normalized);
}

export function validateTtl(ttl: number | null): Validation<number> {
  if (ttl === null) return ok(DEFAULT_TTL);
  if (!Number.isInteger(ttl) || ttl < MIN_TTL || ttl > MAX_TTL) {
    return err(`TTL must be an integer between ${MIN_TTL} and ${MAX_TTL}.`, "ttl");
  }
  return ok(ttl);
}

export interface RoutingResult {
  policy: string;
  setIdentifier: string | null;
  weight: number | null;
}

export function validateRouting(
  routingPolicy: string | null | undefined,
  setIdentifier: string | null | undefined,
  weight: number | null | undefined,
): Validation<RoutingResult> {
  const raw = (routingPolicy ?? "Simple").trim();
  const canonical =
    ROUTING_POLICIES.find((policy) => policy.toLowerCase() === raw.toLowerCase()) ?? raw;
  if (!(ROUTING_POLICIES as readonly string[]).includes(canonical)) {
    return err(`Routing policy must be one of: ${ROUTING_POLICIES.join(", ")}.`, "routing_policy");
  }
  if (canonical === "Simple") return ok({ policy: canonical, setIdentifier: null, weight: null });

  const identifier = (setIdentifier ?? "").trim() || null;
  if (identifier === null) {
    return err(
      `Record ID (set identifier) is required for ${canonical} routing.`,
      "set_identifier",
    );
  }
  if (identifier.length > MAX_SET_IDENTIFIER) {
    return err(`Record ID must be at most ${MAX_SET_IDENTIFIER} characters.`, "set_identifier");
  }
  if (canonical === "Weighted") {
    if (weight === null || weight === undefined) {
      return err("Weight is required for Weighted routing.", "weight");
    }
    if (!Number.isInteger(weight) || weight < 0 || weight > MAX_WEIGHT) {
      return err(`Weight must be between 0 and ${MAX_WEIGHT}.`, "weight");
    }
    return ok({ policy: canonical, setIdentifier: identifier, weight });
  }
  return ok({ policy: canonical, setIdentifier: identifier, weight: null });
}

export interface AliasResult {
  values: string[];
  ttl: number | null;
  aliasTarget: string | null;
}

export function validateAlias(
  recordType: string,
  isAlias: boolean,
  aliasTarget: string | null | undefined,
  values: readonly string[],
  ttl: number | null,
): Validation<AliasResult> {
  const rtype = validateRecordType(recordType);
  if (!rtype.ok) return rtype;
  if (isAlias) {
    if (!(ALIAS_TYPES as readonly string[]).includes(rtype.value)) {
      return err(`Alias is only supported for ${ALIAS_TYPES.join(", ")} records.`, "is_alias");
    }
    const target = (aliasTarget ?? "").trim();
    if (!target || !isValidHostname(target)) {
      return err(
        "Choose a valid alias target, e.g. d111111abcdef8.cloudfront.net.",
        "alias_target",
      );
    }
    if (values.some((value) => value.trim().length > 0)) {
      return err("Alias records cannot have values; remove them or turn alias off.", "values");
    }
    return ok({ values: [], ttl: null, aliasTarget: normalizeHostname(target) });
  }
  const normalized = validateValues(rtype.value, values);
  if (!normalized.ok) return normalized;
  const seconds = validateTtl(ttl);
  if (!seconds.ok) return seconds;
  return ok({ values: normalized.value, ttl: seconds.value, aliasTarget: null });
}

export function validateComment(comment: string | null | undefined): Validation<string | null> {
  if (comment === null || comment === undefined) return ok(null);
  const text = comment.trim();
  if (text.length > MAX_COMMENT) {
    return err(`Comment must be at most ${MAX_COMMENT} characters.`, "comment");
  }
  return ok(text || null);
}
