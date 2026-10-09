import type { ImportRecordPreview } from "@/types/api";

/** Counts of records the dry run would create, grouped by DNS type. */
export function importTypeBreakdown(
  records: Pick<ImportRecordPreview, "type" | "status">[],
): string {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.status !== "new") continue;
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
}
