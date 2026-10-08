/**
 * Shared API types. Each type mirrors a Pydantic schema in `backend/app/schemas`
 * field for field; keep the two in sync when either side changes.
 */

// ---------------------------------------------------------------------------
// common.py
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  fields: Record<string, string>;
}

/** Shape of every non-2xx response body. */
export interface ApiErrorBody {
  error: ApiErrorDetail;
}

export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// auth.py
// ---------------------------------------------------------------------------

export interface LoginRequest {
  account_id: string;
  username: string;
  password: string;
  remember: boolean;
}

export interface User {
  id: number;
  account_id: string;
  username: string;
  display_name: string;
  created_at: string;
}

export interface Session {
  user: User;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// hosted_zone.py
// ---------------------------------------------------------------------------

export const ZONE_TYPES = ["public", "private"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const MAX_TAGS = 50;
export const MAX_ZONE_DESCRIPTION = 256;

export interface Tag {
  key: string;
  value: string;
}

export interface HostedZoneCreate {
  name: string;
  type: ZoneType;
  description?: string | null;
  vpc_id?: string | null;
  vpc_region?: string | null;
  tags?: Tag[];
}

/** Only the description and tags are editable; name and type are immutable. */
export interface HostedZoneUpdate {
  description?: string | null;
  tags?: Tag[] | null;
}

export interface TagsReplace {
  tags: Tag[];
}

export interface HostedZone {
  id: string;
  /** Normalized name with trailing dot, e.g. `example.com.` */
  name: string;
  type: ZoneType;
  description: string | null;
  vpc_id: string | null;
  vpc_region: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  record_count: number;
  tags: Tag[];
  name_servers: string[];
}

export const ZONE_SORT_FIELDS = [
  "name",
  "type",
  "created_by",
  "record_count",
  "description",
  "id",
  "created_at",
] as const;
export type ZoneSortField = (typeof ZONE_SORT_FIELDS)[number];

// ---------------------------------------------------------------------------
// dns_record.py
// ---------------------------------------------------------------------------

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
export type RecordType = (typeof RECORD_TYPES)[number];

/** Types a user can create; SOA only exists as the zone's default record. */
export const USER_RECORD_TYPES = RECORD_TYPES.filter((t) => t !== "SOA");

export const ROUTING_POLICIES = [
  "Simple",
  "Weighted",
  "Latency",
  "Failover",
  "Geolocation",
  "Multivalue",
] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export const ALIAS_TYPES: readonly RecordType[] = ["A", "AAAA", "CNAME"];

export interface RecordInput {
  /** Relative label (`www`), full name, or empty for the zone apex. */
  name: string;
  type: RecordType;
  /** Seconds; ignored (null) for alias records. */
  ttl?: number | null;
  values: string[];
  routing_policy?: RoutingPolicy;
  set_identifier?: string | null;
  weight?: number | null;
  is_alias?: boolean;
  alias_target?: string | null;
  evaluate_target_health?: boolean | null;
  health_check_id?: string | null;
  comment?: string | null;
}

export type RecordCreate = RecordInput;
/** Full replacement. For the default apex NS/SOA only TTL and values are applied. */
export type RecordUpdate = RecordInput;

export interface DnsRecord {
  id: number;
  zone_id: string;
  /** FQDN with trailing dot. */
  name: string;
  type: RecordType;
  ttl: number | null;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier: string | null;
  weight: number | null;
  is_alias: boolean;
  alias_target: string | null;
  evaluate_target_health: boolean | null;
  health_check_id: string | null;
  comment: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface BulkDeleteRequest {
  ids: number[];
}

export type BulkDeleteStatus = "deleted" | "skipped" | "not_found";

export interface BulkDeleteItem {
  id: number;
  status: BulkDeleteStatus;
  message: string | null;
}

export interface BulkDeleteResponse {
  results: BulkDeleteItem[];
  deleted: number;
  skipped: number;
  not_found: number;
}

export const RECORD_SORT_FIELDS = ["name", "type", "ttl", "routing_policy", "created_at"] as const;
export type RecordSortField = (typeof RECORD_SORT_FIELDS)[number];

// ---------------------------------------------------------------------------
// bind.py
// ---------------------------------------------------------------------------

export type ImportStatus = "new" | "skipped" | "error";

export interface ImportLineError {
  line: number | null;
  message: string;
}

export interface ImportRecordPreview {
  line: number | null;
  name: string;
  type: string;
  ttl: number | null;
  values: string[];
  status: ImportStatus;
  reason: string | null;
}

export interface ImportSummary {
  dry_run: boolean;
  imported: number;
  skipped: number;
  errors: ImportLineError[];
  records: ImportRecordPreview[];
}

export type ExportFormat = "json" | "bind";

// ---------------------------------------------------------------------------
// Shared list query parameters
// ---------------------------------------------------------------------------

export type SortOrder = "asc" | "desc";

export interface PageQuery {
  page?: number;
  page_size?: number;
}
