"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zoneKeys } from "@/hooks/useZones";
import { api } from "@/lib/api";
import type {
  BulkDeleteResponse,
  DnsRecord,
  Paginated,
  RecordCreate,
  RecordSortField,
  RecordType,
  RecordUpdate,
  RoutingPolicy,
  SortOrder,
} from "@/types/api";

export interface RecordListParams {
  zoneId: string;
  q?: string;
  type?: RecordType;
  routing_policy?: RoutingPolicy;
  alias?: boolean;
  name?: string;
  page: number;
  page_size: number;
  sort?: RecordSortField;
  order?: SortOrder;
}

export const recordKeys = {
  all: ["records"] as const,
  lists: (zoneId: string) => [...recordKeys.all, "list", zoneId] as const,
  list: (params: RecordListParams) => [...recordKeys.lists(params.zoneId), params] as const,
  details: (zoneId: string) => [...recordKeys.all, "detail", zoneId] as const,
  detail: (zoneId: string, recordId: number) => [...recordKeys.details(zoneId), recordId] as const,
};

async function refreshRecords(queryClient: ReturnType<typeof useQueryClient>, zoneId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: recordKeys.lists(zoneId) }),
    queryClient.invalidateQueries({ queryKey: recordKeys.details(zoneId) }),
    queryClient.invalidateQueries({ queryKey: zoneKeys.detail(zoneId) }),
    queryClient.invalidateQueries({ queryKey: zoneKeys.lists() }),
  ]);
}

export function useRecords(params: RecordListParams) {
  return useQuery({
    queryKey: recordKeys.list(params),
    queryFn: () =>
      api.get<Paginated<DnsRecord>>(
        `/api/hostedzones/${encodeURIComponent(params.zoneId)}/records`,
        {
          q: params.q,
          type: params.type,
          routing_policy: params.routing_policy,
          alias: params.alias,
          name: params.name,
          page: params.page,
          page_size: params.page_size,
          sort: params.sort,
          order: params.order,
        },
      ),
    placeholderData: keepPreviousData,
    enabled: Boolean(params.zoneId),
  });
}

export function useRecord(zoneId: string, recordId: number, enabled = true) {
  return useQuery({
    queryKey: recordKeys.detail(zoneId, recordId),
    queryFn: () =>
      api.get<DnsRecord>(`/api/hostedzones/${encodeURIComponent(zoneId)}/records/${recordId}`),
    enabled: enabled && Boolean(zoneId) && Number.isInteger(recordId) && recordId > 0,
  });
}

export function useCreateRecords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, records }: { zoneId: string; records: RecordCreate[] }) =>
      api.post<DnsRecord[]>(`/api/hostedzones/${encodeURIComponent(zoneId)}/records`, records),
    onSuccess: async (created, { zoneId }) => {
      for (const record of created) {
        queryClient.setQueryData(recordKeys.detail(zoneId, record.id), record);
      }
      await refreshRecords(queryClient, zoneId);
    },
  });
}

export function useUpdateRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      zoneId,
      recordId,
      payload,
    }: {
      zoneId: string;
      recordId: number;
      payload: RecordUpdate;
    }) =>
      api.put<DnsRecord>(
        `/api/hostedzones/${encodeURIComponent(zoneId)}/records/${recordId}`,
        payload,
      ),
    onSuccess: async (record) => {
      queryClient.setQueryData(recordKeys.detail(record.zone_id, record.id), record);
      await refreshRecords(queryClient, record.zone_id);
    },
  });
}

export function useDeleteRecords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ zoneId, ids }: { zoneId: string; ids: number[] }) =>
      api.post<BulkDeleteResponse>(
        `/api/hostedzones/${encodeURIComponent(zoneId)}/records/bulk-delete`,
        { ids },
      ),
    onSuccess: async (result, { zoneId }) => {
      for (const item of result.results) {
        if (item.status === "deleted") {
          queryClient.removeQueries({ queryKey: recordKeys.detail(zoneId, item.id) });
        }
      }
      await refreshRecords(queryClient, zoneId);
    },
  });
}
