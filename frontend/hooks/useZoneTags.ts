"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zoneKeys } from "@/hooks/useZones";
import { api } from "@/lib/api";
import type { HostedZone, Tag } from "@/types/api";

/** Replaces the tag set on a hosted zone and refreshes the zone detail and list. */
export function useZoneTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, tags }: { zoneId: string; tags: Tag[] }) =>
      api.put<HostedZone>(`/api/hostedzones/${encodeURIComponent(zoneId)}/tags`, { tags }),
    onSuccess: async (zone) => {
      queryClient.setQueryData(zoneKeys.detail(zone.id), zone);
      await queryClient.invalidateQueries({ queryKey: zoneKeys.lists() });
    },
  });
}
