"use client";

import Box from "@cloudscape-design/components/box";
import type { CollectionPreferencesProps } from "@cloudscape-design/components/collection-preferences";
import type { PropertyFilterProps } from "@cloudscape-design/components/property-filter";
import type { TableProps } from "@cloudscape-design/components/table";
import { RouterLink } from "@/components/common/RouterLink";
import { ROUTES } from "@/lib/constants";
import { capitalize, displayName, formatNumber } from "@/lib/format";
import type { HostedZone, ZoneSortField, ZoneType } from "@/types/api";

export type ZoneColumnId = "name" | "type" | "created_by" | "record_count" | "description" | "id";

/** Columns in the same order as the real Route 53 console. */
export const ZONE_COLUMNS: TableProps.ColumnDefinition<HostedZone>[] = [
  {
    id: "name",
    header: "Hosted zone name",
    sortingField: "name",
    isRowHeader: true,
    minWidth: 200,
    cell: (zone) => (
      <RouterLink href={ROUTES.hostedZone(zone.id)} fontSize="body-m">
        {displayName(zone.name)}
      </RouterLink>
    ),
  },
  {
    id: "type",
    header: "Type",
    sortingField: "type",
    minWidth: 100,
    cell: (zone) => capitalize(zone.type),
  },
  {
    id: "created_by",
    header: "Created by",
    sortingField: "created_by",
    minWidth: 120,
    cell: (zone) => zone.created_by,
  },
  {
    id: "record_count",
    header: "Record count",
    sortingField: "record_count",
    minWidth: 120,
    cell: (zone) => <Box textAlign="right">{formatNumber(zone.record_count)}</Box>,
  },
  {
    id: "description",
    header: "Description",
    sortingField: "description",
    minWidth: 200,
    cell: (zone) => zone.description || "-",
  },
  {
    id: "id",
    header: "Hosted zone ID",
    sortingField: "id",
    minWidth: 220,
    cell: (zone) => zone.id,
  },
];

export const ZONE_SORT_FIELD_IDS: readonly ZoneSortField[] = [
  "name",
  "type",
  "created_by",
  "record_count",
  "description",
  "id",
];

export function isZoneSortField(value: unknown): value is ZoneSortField {
  return typeof value === "string" && (ZONE_SORT_FIELD_IDS as readonly string[]).includes(value);
}

export const ZONE_FILTERING_PROPERTIES: PropertyFilterProps.FilteringProperty[] = [
  {
    key: "name",
    propertyLabel: "Hosted zone name",
    groupValuesLabel: "Hosted zone name values",
    operators: [":", "="],
  },
  {
    key: "type",
    propertyLabel: "Type",
    groupValuesLabel: "Type values",
    operators: ["="],
  },
  {
    key: "description",
    propertyLabel: "Description",
    groupValuesLabel: "Description values",
    operators: [":"],
  },
  {
    key: "id",
    propertyLabel: "Hosted zone ID",
    groupValuesLabel: "Hosted zone ID values",
    operators: ["=", ":"],
  },
];

export const ZONE_FILTERING_OPTIONS: PropertyFilterProps.FilteringOption[] = [
  { propertyKey: "type", value: "public", label: "Public" },
  { propertyKey: "type", value: "private", label: "Private" },
];

export interface ZoneFilterParams {
  q?: string;
  type?: ZoneType;
  name?: string;
}

/**
 * Maps PropertyFilter tokens onto the backend's query parameters. `name` and
 * `type` have dedicated filters; free text, description and ID tokens all go
 * through the server's `q` search (which matches name, description, ID and type).
 */
export function queryToParams(query: PropertyFilterProps.Query): ZoneFilterParams {
  const params: ZoneFilterParams = {};
  const q: string[] = [];
  for (const token of query.tokens) {
    const value = String(token.value ?? "").trim();
    if (!value) continue;
    if (token.propertyKey === "type") {
      const lowered = value.toLowerCase();
      if (lowered === "public" || lowered === "private") params.type = lowered;
    } else if (token.propertyKey === "name") {
      params.name = value.toLowerCase();
    } else {
      q.push(value);
    }
  }
  if (q.length > 0) params.q = q.join(" ");
  return params;
}

export const EMPTY_QUERY: PropertyFilterProps.Query = { tokens: [], operation: "and" };

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export interface ZonePreferences {
  pageSize: number;
  wrapLines: boolean;
  stripedRows: boolean;
  contentDisplay: { id: ZoneColumnId; visible: boolean }[];
}

export const DEFAULT_ZONE_PREFERENCES: ZonePreferences = {
  pageSize: 10,
  wrapLines: false,
  stripedRows: false,
  contentDisplay: [
    { id: "name", visible: true },
    { id: "type", visible: true },
    { id: "created_by", visible: true },
    { id: "record_count", visible: true },
    { id: "description", visible: true },
    { id: "id", visible: true },
  ],
};

const COLUMN_IDS = new Set<string>(DEFAULT_ZONE_PREFERENCES.contentDisplay.map((c) => c.id));

export function isZonePreferences(value: unknown): value is ZonePreferences {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pageSize === "number" &&
    (PAGE_SIZE_OPTIONS as readonly number[]).includes(candidate.pageSize) &&
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

export const CONTENT_DISPLAY_OPTIONS: CollectionPreferencesProps.ContentDisplayOption[] =
  ZONE_COLUMNS.map((column) => ({
    id: column.id ?? "",
    label: typeof column.header === "string" ? column.header : (column.id ?? ""),
    alwaysVisible: column.id === "name",
  }));
