"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  HostedZone,
  HostedZoneCreate,
  HostedZoneUpdate,
  Paginated,
  SortOrder,
  ZoneSortField,
  ZoneType,
} from "@/types/api";

export interface ZoneListParams {
  q?: string;
  type?: ZoneType;
  name?: string;
  page: number;
  page_size: number;
  sort?: ZoneSortField;
  order?: SortOrder;
}

export const zoneKeys = {
  all: ["zones"] as const,
  lists: () => [...zoneKeys.all, "list"] as const,
  list: (params: ZoneListParams) => [...zoneKeys.lists(), params] as const,
  details: () => [...zoneKeys.all, "detail"] as const,
  detail: (zoneId: string) => [...zoneKeys.details(), zoneId] as const,
};

export function fetchZones(params: ZoneListParams): Promise<Paginated<HostedZone>> {
  return api.get<Paginated<HostedZone>>("/api/hostedzones", { ...params });
}

export function fetchZone(zoneId: string): Promise<HostedZone> {
  return api.get<HostedZone>(`/api/hostedzones/${encodeURIComponent(zoneId)}`);
}

/** Server-side filtered, sorted and paginated list; keeps the previous page while loading. */
export function useZones(params: ZoneListParams) {
  return useQuery({
    queryKey: zoneKeys.list(params),
    queryFn: () => fetchZones(params),
    placeholderData: keepPreviousData,
  });
}

export function useZone(zoneId: string | undefined) {
  return useQuery({
    queryKey: zoneKeys.detail(zoneId ?? ""),
    queryFn: () => fetchZone(zoneId ?? ""),
    enabled: Boolean(zoneId),
  });
}

export function useCreateZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: HostedZoneCreate) => api.post<HostedZone>("/api/hostedzones", payload),
    onSuccess: async (zone) => {
      queryClient.setQueryData(zoneKeys.detail(zone.id), zone);
      await queryClient.invalidateQueries({ queryKey: zoneKeys.lists() });
    },
  });
}

export function useUpdateZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, payload }: { zoneId: string; payload: HostedZoneUpdate }) =>
      api.put<HostedZone>(`/api/hostedzones/${encodeURIComponent(zoneId)}`, payload),
    onSuccess: async (zone) => {
      queryClient.setQueryData(zoneKeys.detail(zone.id), zone);
      await queryClient.invalidateQueries({ queryKey: zoneKeys.lists() });
    },
  });
}

export function useDeleteZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, force = false }: { zoneId: string; force?: boolean }) =>
      api.delete<void>(`/api/hostedzones/${encodeURIComponent(zoneId)}`, { force }),
    onSuccess: async (_, { zoneId }) => {
      queryClient.removeQueries({ queryKey: zoneKeys.detail(zoneId) });
      await queryClient.invalidateQueries({ queryKey: zoneKeys.lists() });
    },
  });
}
