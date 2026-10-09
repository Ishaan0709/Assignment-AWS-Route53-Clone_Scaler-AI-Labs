"use client";

import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import { useNotifications } from "@/hooks/useNotifications";
import { downloadZoneExport } from "@/hooks/useZoneFile";
import type { ExportFormat } from "@/types/api";

interface ExportZoneButtonProps {
  zoneId: string;
  /** Display name without a trailing dot, used if the response has no filename. */
  fileBase: string;
}

/** JSON, BIND and CSV downloads. The API names the file `name.json`, `name.zone` or `name.csv`. */
export function ExportZoneButton({ zoneId, fileBase }: ExportZoneButtonProps) {
  const notify = useNotifications();
  return (
    <ButtonDropdown
      data-testid="export-zone"
      items={[
        { id: "json", text: "JSON" },
        { id: "bind", text: "BIND" },
        { id: "csv", text: "CSV" },
      ]}
      onItemClick={({ detail }) => {
        const format: ExportFormat =
          detail.id === "bind" || detail.id === "csv" ? detail.id : "json";
        const extension = format === "bind" ? "zone" : format;
        void downloadZoneExport(zoneId, format, `${fileBase}.${extension}`)
          .then((filename) => notify.success(`Downloaded ${filename}.`))
          .catch(() => notify.error("The zone file could not be downloaded."));
      }}
    >
      Export
    </ButtonDropdown>
  );
}
