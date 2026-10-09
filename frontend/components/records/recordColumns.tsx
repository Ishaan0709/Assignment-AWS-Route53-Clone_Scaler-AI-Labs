"use client";

import Box from "@cloudscape-design/components/box";
import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import type { PropertyFilterProps } from "@cloudscape-design/components/property-filter";
import type { TableProps } from "@cloudscape-design/components/table";
import { unpackSetIdentifier } from "@/lib/recordDraft";
import { displayName, formatNumber } from "@/lib/format";
import type { DnsRecord, RecordSortField, RecordType, RoutingPolicy } from "@/types/api";
import { RECORD_SORT_FIELDS, RECORD_TYPES, ROUTING_POLICIES } from "@/types/api";

export type RecordColumnId =
  | "name"
  | "type"
  | "routing_policy"
  | "differential"
  | "alias"
  | "value"
  | "ttl"
  | "health_check_id"
  | "evaluate_target_health";

function yesNo(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value ? "Yes" : "No";
}

function stacked(lines: readonly string[]) {
  const shown = lines.length > 0 ? lines : ["-"];
  return (
    <span>
      {shown.map((line, index) => (
        <span key={`${index}-${line}`} style={{ display: "block" }}>
          {line}
        </span>
      ))}
    </span>
  );
}

/** Routing-policy differentiator, in the same spirit as the Route 53 column. */
export function differentialText(record: DnsRecord): string {
  if (record.routing_policy === "Simple") return "-";
  const unpacked = unpackSetIdentifier(record.routing_policy, record.set_identifier);
  if (record.routing_policy === "Weighted") {
    const weight = record.weight === null ? null : `Weight: ${record.weight}`;
    const id = record.set_identifier ? `ID: ${record.set_identifier}` : null;
    return [weight, id].filter((part): part is string => Boolean(part)).join(", ") || "-";
  }
  if (record.routing_policy === "Latency" && unpacked.region) {
    return unpacked.recordId && unpacked.recordId !== unpacked.region
      ? `Region: ${unpacked.region}, ID: ${unpacked.recordId}`
      : `Region: ${unpacked.region}`;
  }
  if (record.routing_policy === "Failover" && unpacked.failover) {
    const label =
      unpacked.failover === "PRIMARY"
        ? "Primary"
        : unpacked.failover === "SECONDARY"
          ? "Secondary"
          : unpacked.failover;
    return unpacked.recordId && unpacked.recordId !== unpacked.failover
      ? `${label}, ID: ${unpacked.recordId}`
      : label;
  }
  if (record.routing_policy === "Geolocation" && unpacked.location) {
    return unpacked.recordId && unpacked.recordId !== unpacked.location
      ? `Location: ${unpacked.location}, ID: ${unpacked.recordId}`
      : `Location: ${unpacked.location}`;
  }
  return record.set_identifier ?? "-";
}

export const RECORD_COLUMNS: TableProps.ColumnDefinition<DnsRecord>[] = [
  {
    id: "name",
    header: "Record name",
    sortingField: "name",
    isRowHeader: true,
    minWidth: 220,
    cell: (record) => (
      <span>
        {displayName(record.name)}
        {record.is_default ? (
          <Box color="text-status-info" display="inline" fontSize="body-s">
            <span data-testid="default-record"> · Default</span>
          </Box>
        ) : null}
      </span>
    ),
  },
  {
    id: "type",
    header: "Type",
    sortingField: "type",
    minWidth: 90,
    cell: (record) => record.type,
  },
  {
    id: "routing_policy",
    header: "Routing policy",
    sortingField: "routing_policy",
    minWidth: 140,
    cell: (record) => record.routing_policy,
  },
  {
    id: "differential",
    header: "Differential",
    minWidth: 160,
    cell: (record) => differentialText(record),
  },
  {
    id: "alias",
    header: "Alias",
    minWidth: 80,
    cell: (record) => (record.is_alias ? "Yes" : "No"),
  },
  {
    id: "value",
    header: "Value/Route traffic to",
    minWidth: 240,
    cell: (record) => stacked(record.is_alias ? [record.alias_target ?? "-"] : record.values),
  },
  {
    id: "ttl",
    header: "TTL (seconds)",
    sortingField: "ttl",
    minWidth: 130,
    cell: (record) => (record.ttl === null ? "-" : formatNumber(record.ttl)),
  },
  {
    id: "health_check_id",
    header: "Health check ID",
    minWidth: 150,
    cell: (record) => record.health_check_id || "-",
  },
  {
    id: "evaluate_target_health",
    header: "Evaluate target health",
    minWidth: 180,
    cell: (record) => yesNo(record.evaluate_target_health),
  },
];

export function isRecordSortField(value: unknown): value is RecordSortField {
  return typeof value === "string" && (RECORD_SORT_FIELDS as readonly string[]).includes(value);
}

export const RECORD_FILTERING_PROPERTIES: PropertyFilterProps.FilteringProperty[] = [
  {
    key: "name",
    propertyLabel: "Record name",
    groupValuesLabel: "Record name values",
    operators: [":", "="],
  },
  {
    key: "value",
    propertyLabel: "Value",
    groupValuesLabel: "Value values",
    operators: [":"],
  },
];

export interface RecordFilterParams {
  q?: string;
  name?: string;
}

/** Free text and value tokens go to `q` (name, value, alias target, record ID). Name has its own param. */
export function queryToRecordParams(query: PropertyFilterProps.Query): RecordFilterParams {
  const params: RecordFilterParams = {};
  const q: string[] = [];
  for (const token of query.tokens) {
    const value = String(token.value ?? "").trim();
    if (!value) continue;
    if (token.propertyKey === "name") params.name = value.toLowerCase();
    else q.push(value);
  }
  if (q.length > 0) params.q = q.join(" ");
  return params;
}

export const EMPTY_RECORD_QUERY: PropertyFilterProps.Query = { tokens: [], operation: "and" };

export const RECORD_PAGE_SIZES = [10, 50, 100] as const;

export interface RecordPreferences {
  pageSize: number;
  wrapLines: boolean;
  stripedRows: boolean;
  contentDisplay: { id: RecordColumnId; visible: boolean }[];
}

export const DEFAULT_RECORD_PREFERENCES: RecordPreferences = {
  pageSize: 10,
  wrapLines: false,
  stripedRows: false,
  contentDisplay: [
    { id: "name", visible: true },
    { id: "type", visible: true },
    { id: "routing_policy", visible: true },
    { id: "differential", visible: true },
    { id: "alias", visible: true },
    { id: "value", visible: true },
    { id: "ttl", visible: true },
    { id: "health_check_id", visible: true },
    { id: "evaluate_target_health", visible: true },
  ],
};

const COLUMN_IDS = new Set<string>(
  DEFAULT_RECORD_PREFERENCES.contentDisplay.map((column) => column.id),
);

export function isRecordPreferences(value: unknown): value is RecordPreferences {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pageSize === "number" &&
    (RECORD_PAGE_SIZES as readonly number[]).includes(candidate.pageSize) &&
    typeof candidate.wrapLines === "boolean" &&
    typeof candidate.stripedRows === "boolean" &&
    Array.isArray(candidate.contentDisplay) &&
    candidate.contentDisplay.length === COLUMN_IDS.size &&
    candidate.contentDisplay.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        COLUMN_IDS.has(String((entry as { id?: unknown }).id)) &&
        typeof (entry as { visible?: unknown }).visible === "boolean",
    )
  );
}

export const RECORD_CONTENT_DISPLAY: CollectionPreferencesProps.ContentDisplayOption[] =
  RECORD_COLUMNS.map((column) => ({
    id: column.id ?? "",
    label: typeof column.header === "string" ? column.header : (column.id ?? ""),
    alwaysVisible: column.id === "name",
  }));

export const TYPE_FILTER_OPTIONS: { value: "" | RecordType; label: string }[] = [
  { value: "", label: "All types" },
  ...RECORD_TYPES.map((type) => ({ value: type, label: type })),
];

export const POLICY_FILTER_OPTIONS: { value: "" | RoutingPolicy; label: string }[] = [
  { value: "", label: "All routing policies" },
  ...ROUTING_POLICIES.map((policy) => ({ value: policy, label: policy })),
];

export const ALIAS_FILTER_OPTIONS = [
  { value: "", label: "All records" },
  { value: "true", label: "Alias only" },
  { value: "false", label: "Non-alias only" },
] as const;
