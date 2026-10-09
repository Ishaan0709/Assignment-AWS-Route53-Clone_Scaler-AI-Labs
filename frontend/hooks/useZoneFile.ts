"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordKeys } from "@/hooks/useRecords";
import { zoneKeys } from "@/hooks/useZones";
import { api, apiFetchBlob } from "@/lib/api";
import type { ExportFormat, ImportSummary } from "@/types/api";

export function useImportZoneFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      zoneId,
      file,
      text,
      dryRun,
    }: {
      zoneId: string;
      file?: File | null;
      text?: string;
      dryRun: boolean;
    }) => {
      const body = new FormData();
      if (file) body.append("file", file);
      if (text && text.trim()) body.append("text", text);
      body.append("dry_run", dryRun ? "true" : "false");
      return api.post<ImportSummary>(`/api/hostedzones/${encodeURIComponent(zoneId)}/import`, body);
    },
    onSuccess: async (_summary, { zoneId, dryRun }) => {
      if (dryRun) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: recordKeys.lists(zoneId) }),
        queryClient.invalidateQueries({ queryKey: zoneKeys.detail(zoneId) }),
        queryClient.invalidateQueries({ queryKey: zoneKeys.lists() }),
      ]);
    },
  });
}

/** Downloads the zone file. The backend sets `Content-Disposition` to `name.zone` or `name.json`. */
export async function downloadZoneExport(
  zoneId: string,
  format: ExportFormat,
  fallbackName: string,
): Promise<string> {
  const { blob, filename } = await apiFetchBlob(
    `/api/hostedzones/${encodeURIComponent(zoneId)}/export`,
    { format },
  );
  const name = filename ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}
