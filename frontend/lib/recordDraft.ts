/**
 * Form drafts, client validation and the server-field mapping for record create/edit.
 * Routing extras (region, failover, location) are stored in `set_identifier` so they
 * survive a refresh without a schema change. Weighted weight stays in `weight`.
 */

import { FAILOVER_OPTIONS, GEO_LOCATIONS, LATENCY_REGIONS } from "@/lib/recordOptions";
import {
  ALIAS_TYPES,
  MAX_HEALTH_CHECK_ID,
  ensureDot,
  err,
  normalizeRecordName,
  stripDot,
  validateAlias,
  validateComment,
  validateRouting,
  validateTtl,
  validateValues,
  type ValidationErr,
} from "@/lib/recordValidators";
import type { DnsRecord, RecordInput, RecordType, RoutingPolicy } from "@/types/api";

const PACK = " | ";

export interface RecordDraft {
  key: string;
  name: string;
  type: RecordType;
  valuesText: string;
  ttl: string;
  routingPolicy: RoutingPolicy;
  setIdentifier: string;
  weight: string;
  isAlias: boolean;
  aliasTarget: string;
  evaluateTargetHealth: boolean;
  healthCheckId: string;
  comment: string;
  region: string;
  failover: string;
  location: string;
}

export type RecordFieldErrors = Partial<
  Record<
    | "name"
    | "type"
    | "values"
    | "ttl"
    | "routing_policy"
    | "set_identifier"
    | "weight"
    | "is_alias"
    | "alias_target"
    | "comment"
    | "health_check_id",
    string
  >
>;

const FIELD_NAMES = [
  "name",
  "type",
  "values",
  "ttl",
  "routing_policy",
  "set_identifier",
  "weight",
  "is_alias",
  "alias_target",
  "comment",
  "health_check_id",
] as const;

export function isRecordField(value: string): value is (typeof FIELD_NAMES)[number] {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

let draftCounter = 0;

export function newDraft(partial: Partial<RecordDraft> = {}): RecordDraft {
  draftCounter += 1;
  return {
    key: `draft-${draftCounter}`,
    name: "",
    type: "A",
    valuesText: "",
    ttl: "300",
    routingPolicy: "Simple",
    setIdentifier: "",
    weight: "",
    isAlias: false,
    aliasTarget: "",
    evaluateTargetHealth: false,
    healthCheckId: "",
    comment: "",
    region: "",
    failover: "",
    location: "",
    ...partial,
  };
}

export function relativeRecordName(fqdn: string, zoneName: string): string {
  const zone = stripDot(zoneName.toLowerCase());
  const name = stripDot(fqdn.toLowerCase());
  if (name === zone) return "";
  const suffix = `.${zone}`;
  if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  return stripDot(fqdn);
}

export interface UnpackedIdentifier {
  recordId: string;
  region: string;
  failover: string;
  location: string;
}

function splitKnown(value: string, known: readonly string[]): { extra: string; recordId: string } {
  for (const item of known) {
    if (value === item) return { extra: item, recordId: item };
    const prefix = `${item}${PACK}`;
    if (value.startsWith(prefix)) return { extra: item, recordId: value.slice(prefix.length) };
  }
  return { extra: "", recordId: value };
}

export function unpackSetIdentifier(
  policy: RoutingPolicy,
  setIdentifier: string | null,
): UnpackedIdentifier {
  const raw = setIdentifier ?? "";
  const empty = { recordId: raw, region: "", failover: "", location: "" };
  if (policy === "Latency") {
    const { extra, recordId } = splitKnown(
      raw,
      LATENCY_REGIONS.map((region) => region.value),
    );
    return { ...empty, recordId, region: extra };
  }
  if (policy === "Failover") {
    const { extra, recordId } = splitKnown(
      raw,
      FAILOVER_OPTIONS.map((option) => option.value),
    );
    return { ...empty, recordId, failover: extra };
  }
  if (policy === "Geolocation") {
    const { extra, recordId } = splitKnown(
      raw,
      GEO_LOCATIONS.map((option) => option.value),
    );
    return { ...empty, recordId, location: extra };
  }
  return empty;
}

function joinExtra(extra: string, recordId: string): string {
  const id = recordId.trim();
  const value = extra.trim();
  if (value && id && value !== id) return `${value}${PACK}${id}`;
  return id || value;
}

export function composeSetIdentifier(draft: RecordDraft): string {
  if (draft.routingPolicy === "Latency") return joinExtra(draft.region, draft.setIdentifier);
  if (draft.routingPolicy === "Failover") return joinExtra(draft.failover, draft.setIdentifier);
  if (draft.routingPolicy === "Geolocation") return joinExtra(draft.location, draft.setIdentifier);
  return draft.setIdentifier.trim();
}

export function draftFromRecord(record: DnsRecord, zoneName: string): RecordDraft {
  const unpacked = unpackSetIdentifier(record.routing_policy, record.set_identifier);
  return newDraft({
    name: relativeRecordName(record.name, zoneName),
    type: record.type,
    valuesText: record.values.join("\n"),
    ttl: record.ttl === null ? "300" : String(record.ttl),
    routingPolicy: record.routing_policy,
    setIdentifier: unpacked.recordId,
    weight: record.weight === null ? "" : String(record.weight),
    isAlias: record.is_alias,
    aliasTarget: record.alias_target ?? "",
    evaluateTargetHealth: Boolean(record.evaluate_target_health),
    healthCheckId: record.health_check_id ?? "",
    comment: record.comment ?? "",
    region: unpacked.region,
    failover: unpacked.failover,
    location: unpacked.location,
  });
}

export function valueLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function parseInteger(raw: string): { ok: true; value: number | null } | ValidationErr {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(text)) return err(`TTL must be an integer between 0 and 2147483647.`, "ttl");
  return { ok: true, value: Number(text) };
}

function put(errors: RecordFieldErrors, failure: ValidationErr) {
  const field = failure.field;
  if (isRecordField(field) && errors[field] === undefined) errors[field] = failure.message;
}

export interface DraftValidation {
  errors: RecordFieldErrors;
  payload?: RecordInput;
  /** Present when the name normalized, so batch conflict checks can run. */
  normalizedName?: string;
}

export function validateDraft(
  draft: RecordDraft,
  zoneName: string,
  options: { locked?: boolean; allowSoa?: boolean } = {},
): DraftValidation {
  const errors: RecordFieldErrors = {};
  const locked = options.locked === true;

  const name = normalizeRecordName(draft.name, zoneName);
  if (!name.ok) put(errors, name);

  if (!locked && draft.type === "SOA" && !options.allowSoa) {
    put(errors, err("SOA cannot be created manually.", "type"));
  }
  if (
    !locked &&
    draft.type === "CNAME" &&
    name.ok &&
    name.value === ensureDot(zoneName.toLowerCase())
  ) {
    put(errors, err("A CNAME record cannot be created at the zone apex.", "type"));
  }

  const aliasOn =
    !locked && draft.isAlias && (ALIAS_TYPES as readonly string[]).includes(draft.type);
  let values: string[] = [];
  let ttl: number | null = null;
  let aliasTarget: string | null = null;

  if (aliasOn) {
    const alias = validateAlias(draft.type, true, draft.aliasTarget, [], null);
    if (!alias.ok) put(errors, alias);
    else {
      values = alias.value.values;
      ttl = alias.value.ttl;
      aliasTarget = alias.value.aliasTarget;
    }
  } else {
    const parsedTtl = parseInteger(draft.ttl);
    if (!parsedTtl.ok) put(errors, parsedTtl);
    const seconds = parsedTtl.ok ? validateTtl(parsedTtl.value) : null;
    if (seconds && !seconds.ok) put(errors, seconds);
    const normalized = validateValues(draft.type, valueLines(draft.valuesText));
    if (!normalized.ok) put(errors, normalized);
    if (normalized.ok && seconds && seconds.ok) {
      values = normalized.value;
      ttl = seconds.value;
    }
  }

  let setIdentifier: string | null = null;
  let weight: number | null = null;
  let policy: RoutingPolicy = draft.routingPolicy;
  if (!locked) {
    const weightText = draft.weight.trim();
    let weightNumber: number | null = null;
    if (draft.routingPolicy === "Weighted") {
      if (weightText === "") weightNumber = null;
      else if (!/^-?\d+$/.test(weightText)) {
        put(errors, err("Weight must be between 0 and 255.", "weight"));
      } else weightNumber = Number(weightText);
    }
    const routing = validateRouting(
      draft.routingPolicy,
      composeSetIdentifier(draft),
      draft.routingPolicy === "Weighted" ? weightNumber : null,
    );
    if (!routing.ok) put(errors, routing);
    else {
      policy = routing.value.policy as RoutingPolicy;
      setIdentifier = routing.value.setIdentifier;
      weight = routing.value.weight;
    }
  }

  const comment = validateComment(draft.comment);
  if (!comment.ok) put(errors, comment);

  const health = draft.healthCheckId.trim();
  if (!locked && health.length > MAX_HEALTH_CHECK_ID) {
    put(
      errors,
      err(`Health check ID must be at most ${MAX_HEALTH_CHECK_ID} characters.`, "health_check_id"),
    );
  }

  if (Object.keys(errors).length > 0 || !name.ok || !comment.ok) {
    return { errors, normalizedName: name.ok ? name.value : undefined };
  }

  const payload: RecordInput = {
    name: draft.name,
    type: draft.type,
    ttl,
    values,
    routing_policy: policy,
    set_identifier: setIdentifier,
    weight,
    is_alias: aliasOn,
    alias_target: aliasTarget,
    evaluate_target_health: aliasOn ? draft.evaluateTargetHealth : null,
    health_check_id: locked ? draft.healthCheckId.trim() || null : health || null,
    comment: comment.value,
  };
  return { errors, payload, normalizedName: name.value };
}

export interface BatchValidation {
  errors: RecordFieldErrors[];
  payloads?: RecordInput[];
}

/** Validates every draft, then the within-batch CNAME and uniqueness rules. */
export function validateDrafts(
  drafts: readonly RecordDraft[],
  zoneName: string,
  options: { locked?: boolean } = {},
): BatchValidation {
  const results = drafts.map((draft) => validateDraft(draft, zoneName, options));
  const errors = results.map((result) => ({ ...result.errors }));

  const ready = results.flatMap((result, index) => {
    if (!result.payload || !result.normalizedName) return [];
    return [
      {
        index,
        name: result.normalizedName,
        type: result.payload.type,
        policy: result.payload.routing_policy ?? "Simple",
        setId: result.payload.set_identifier ?? null,
      },
    ];
  });

  const at = (index: number): RecordFieldErrors => {
    const existing = errors[index] ?? {};
    errors[index] = existing;
    return existing;
  };

  for (const item of ready) {
    const sameName = ready.filter(
      (other) => other.name === item.name && other.index !== item.index,
    );
    const shown = stripDot(item.name);
    const current = at(item.index);
    if (item.type === "CNAME" && sameName.some((other) => other.type !== "CNAME")) {
      current.name ??= `A CNAME record cannot be created for ${shown} because other record types already exist with that name.`;
    } else if (item.type !== "CNAME" && sameName.some((other) => other.type === "CNAME")) {
      current.name ??= `A ${item.type} record cannot be created for ${shown} because a CNAME record already exists with that name.`;
    }
    const sameType = sameName.filter((other) => other.type === item.type);
    if (sameType.some((other) => other.policy !== item.policy)) {
      current.routing_policy ??= `All ${item.type} records named ${shown} must use the same routing policy.`;
    }
    if (sameType.some((other) => other.setId === item.setId)) {
      if (item.policy === "Simple") {
        current.name ??= `A ${item.type} record named ${shown} already exists.`;
      } else {
        current.set_identifier ??= `A ${item.type} record named ${shown} with record ID '${item.setId}' already exists.`;
      }
    }
  }

  const failed = errors.some((entry) => Object.keys(entry).length > 0);
  if (failed) return { errors };
  const payloads = results
    .map((result) => result.payload)
    .filter((payload): payload is RecordInput => Boolean(payload));
  return { errors, payloads };
}

export function mapServerFields(
  fields: Record<string, string>,
  count: number,
): { records: RecordFieldErrors[]; form?: string } {
  const records: RecordFieldErrors[] = Array.from({ length: count }, () => ({}));
  const leftovers: string[] = [];
  for (const [key, message] of Object.entries(fields)) {
    const indexed = /^(?:records\.)?(\d+)\.(.+)$/.exec(key);
    if (indexed) {
      const index = Number(indexed[1]);
      const field = indexed[2] ?? "";
      const bucket = records[index];
      if (bucket && isRecordField(field) && bucket[field] === undefined) bucket[field] = message;
      else leftovers.push(message);
      continue;
    }
    const only = records[0];
    if (count === 1 && only && isRecordField(key) && only[key] === undefined) only[key] = message;
    else leftovers.push(message);
  }
  return { records, form: leftovers.length > 0 ? leftovers.join(" ") : undefined };
}
