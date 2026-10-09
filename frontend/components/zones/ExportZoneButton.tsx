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

/** JSON and BIND downloads. The API sets the filename to `name.json` or `name.zone`. */
export function ExportZoneButton({ zoneId, fileBase }: ExportZoneButtonProps) {
  const notify = useNotifications();
  return (
    <ButtonDropdown
      data-testid="export-zone"
      items={[
        { id: "json", text: "JSON" },
        { id: "bind", text: "BIND" },
      ]}
      onItemClick={({ detail }) => {
        const format: ExportFormat = detail.id === "bind" ? "bind" : "json";
        const fallback = `${fileBase}.${format === "bind" ? "zone" : "json"}`;
        void downloadZoneExport(zoneId, format, fallback)
          .then((filename) => notify.success(`Downloaded ${filename}.`))
          .catch(() => notify.error("The zone file could not be downloaded."));
      }}
    >
      Export
    </ButtonDropdown>
  );
}
