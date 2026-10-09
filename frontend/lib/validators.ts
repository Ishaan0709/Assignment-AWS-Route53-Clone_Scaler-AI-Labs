import { z } from "zod";
import { MAX_TAGS, MAX_ZONE_DESCRIPTION } from "@/types/api";

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/** 12-digit account ID (dashes allowed) or an account alias (3–63 chars, letters/digits/hyphens). */
const ACCOUNT_ID_PATTERN = /^\d{4}-?\d{4}-?\d{4}$/;
const ACCOUNT_ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/i;

export const loginSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1, "Enter your account ID or alias.")
    .refine(
      (value) => ACCOUNT_ID_PATTERN.test(value) || ACCOUNT_ALIAS_PATTERN.test(value),
      "Enter a 12-digit account ID or a valid account alias.",
    ),
  username: z.string().trim().min(1, "Enter your IAM user name.").max(64, "User name is too long."),
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Flattens zod issues into `{ fieldName: firstMessage }` for form display. */
export function fieldErrors<T>(result: z.SafeParseReturnType<T, T>): Record<string, string> {
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Hosted zone domain names (mirrors backend `services/domain.normalize_domain`)
// ---------------------------------------------------------------------------

export const MAX_DOMAIN_LENGTH = 253;
export const MAX_LABEL_LENGTH = 63;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Returns the validation message for a hosted zone name, or `undefined` when valid. */
export function domainNameError(raw: string): string | undefined {
  let name = raw.trim().toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1);
  if (!name) return "Domain name is required.";
  if (name.length > MAX_DOMAIN_LENGTH) {
    return `Domain name must be at most ${MAX_DOMAIN_LENGTH} characters.`;
  }
  const labels = name.split(".");
  if (labels.length < 2) {
    return "Enter a fully qualified domain name with at least two labels, e.g. example.com.";
  }
  for (const label of labels) {
    if (!label) return "Domain name contains an empty label.";
    if (label.length > MAX_LABEL_LENGTH) {
      return `Each label must be at most ${MAX_LABEL_LENGTH} characters.`;
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return "Labels cannot start or end with a hyphen.";
    }
    if (!DOMAIN_LABEL.test(label)) {
      return "Domain name can only contain lowercase letters, digits, hyphens and dots.";
    }
  }
  return undefined;
}

/** Lowercase without the trailing dot, as typed into the form and shown in tables. */
export function normalizeDomainInput(raw: string): string {
  const name = raw.trim().toLowerCase();
  return name.endsWith(".") ? name.slice(0, -1) : name;
}

// ---------------------------------------------------------------------------
// Tags (mirrors backend `zone_service._validate_tags`)
// ---------------------------------------------------------------------------

export const MAX_TAG_KEY = 128;
export const MAX_TAG_VALUE = 256;

export interface TagRow {
  /** Stable client-side id for React keys. */
  id: string;
  key: string;
  value: string;
}

export interface TagRowError {
  key?: string;
  value?: string;
}

/** Per-row tag errors, indexed like the input array; empty object when the row is valid. */
export function tagErrors(rows: TagRow[]): TagRowError[] {
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const errors: TagRowError = {};
    const key = row.key.trim();
    if (!key) {
      if (row.value.trim()) errors.key = "Tag key is required.";
    } else if (key.length > MAX_TAG_KEY) {
      errors.key = `Tag key must be at most ${MAX_TAG_KEY} characters.`;
    } else if (key.toLowerCase().startsWith("aws:")) {
      errors.key = "Tag keys cannot start with 'aws:'.";
    } else if (seen.has(key)) {
      errors.key = `Duplicate tag key '${key}'.`;
    } else {
      seen.set(key, index);
    }
    if (row.value.length > MAX_TAG_VALUE) {
      errors.value = `Tag value must be at most ${MAX_TAG_VALUE} characters.`;
    }
    return errors;
  });
}

export function hasTagErrors(errors: TagRowError[]): boolean {
  return errors.some((error) => error.key !== undefined || error.value !== undefined);
}

/** Drops blank rows and trims; the result is what gets sent to the API. */
export function tagsToApi(rows: TagRow[]): { key: string; value: string }[] {
  return rows
    .filter((row) => row.key.trim().length > 0)
    .map((row) => ({ key: row.key.trim(), value: row.value.trim() }));
}

export { MAX_TAGS };

// ---------------------------------------------------------------------------
// Hosted zone form
// ---------------------------------------------------------------------------

export interface ZoneFormValues {
  name: string;
  description: string;
  type: "public" | "private";
  vpcRegion: string;
  vpcId: string;
  tags: TagRow[];
}

export type ZoneFormErrors = Partial<
  Record<"name" | "description" | "vpcRegion" | "vpcId", string>
>;

export function descriptionError(value: string): string | undefined {
  return value.length > MAX_ZONE_DESCRIPTION
    ? `Description must be at most ${MAX_ZONE_DESCRIPTION} characters.`
    : undefined;
}

/** Field-level validation for create; `undefined` values mean "valid". */
export function validateZoneForm(values: ZoneFormValues): ZoneFormErrors {
  const errors: ZoneFormErrors = {};
  const name = domainNameError(values.name);
  if (name) errors.name = name;
  const description = descriptionError(values.description);
  if (description) errors.description = description;
  if (values.type === "private") {
    if (!values.vpcRegion) errors.vpcRegion = "Choose the region of the VPC to associate.";
    if (!values.vpcId.trim()) {
      errors.vpcId = "Choose a VPC to associate with the private hosted zone.";
    }
  }
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some((value) => value !== undefined);
}
