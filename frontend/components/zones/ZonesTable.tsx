"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import type { PropertyFilterProps } from "@cloudscape-design/components/property-filter";
import PropertyFilter from "@cloudscape-design/components/property-filter";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { TableProps } from "@cloudscape-design/components/table";
import Table from "@cloudscape-design/components/table";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CONTENT_DISPLAY_OPTIONS,
  DEFAULT_ZONE_PREFERENCES,
  EMPTY_QUERY,
  PAGE_SIZE_OPTIONS,
  ZONE_COLUMNS,
  ZONE_FILTERING_OPTIONS,
  ZONE_FILTERING_PROPERTIES,
  isZonePreferences,
  isZoneSortField,
  queryToParams,
  type ZonePreferences,
} from "@/components/zones/zoneColumns";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { ZoneListParams } from "@/hooks/useZones";
import { useZones } from "@/hooks/useZones";
import { STORAGE_KEYS } from "@/lib/constants";
import { formatNumber, pluralize } from "@/lib/format";
import type { HostedZone, ZoneSortField } from "@/types/api";

interface ZonesTableProps {
  selectedZone: HostedZone | null;
  onSelectionChange: (zone: HostedZone | null) => void;
  /** Header action buttons (View details, Edit, Delete, Create hosted zone). */
  actions: ReactNode;
  /** Shown in the empty state (no zones at all). */
  emptyAction: ReactNode;
}

const DEFAULT_SORT: TableProps.SortingColumn<HostedZone> = { sortingField: "name" };

export function ZonesTable({
  selectedZone,
  onSelectionChange,
  actions,
  emptyAction,
}: ZonesTableProps) {
  const [preferences, setPreferences] = usePersistedState<ZonePreferences>(
    STORAGE_KEYS.zonesPreferences,
    DEFAULT_ZONE_PREFERENCES,
    isZonePreferences,
  );
  const [query, setQuery] = useState<PropertyFilterProps.Query>(EMPTY_QUERY);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [sortingColumn, setSortingColumn] =
    useState<TableProps.SortingColumn<HostedZone>>(DEFAULT_SORT);
  const [sortingDescending, setSortingDescending] = useState(false);
  const [page, setPage] = useState(1);

  const filterParams = useMemo(() => queryToParams(debouncedQuery), [debouncedQuery]);
  const isFiltered = debouncedQuery.tokens.length > 0;

  // Any change to filters, sort or page size starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [filterParams, sortingColumn, sortingDescending, preferences.pageSize]);

  const sortField: ZoneSortField = isZoneSortField(sortingColumn.sortingField)
    ? sortingColumn.sortingField
    : "name";
  const params: ZoneListParams = {
    ...filterParams,
    page,
    page_size: preferences.pageSize,
    sort: sortField,
    order: sortingDescending ? "desc" : "asc",
  };

  const zones = useZones(params);
  const total = zones.data?.total ?? 0;
  const items = zones.data?.items ?? [];
  const pagesCount = Math.max(1, Math.ceil(total / preferences.pageSize));
  const loading = zones.isPending || (zones.isFetching && zones.isPlaceholderData);

  // Clamp the page if the data shrank (e.g. after deleting the last row on a page).
  useEffect(() => {
    if (!zones.isPending && page > pagesCount) setPage(pagesCount);
  }, [page, pagesCount, zones.isPending]);

  // Keep the selection in sync with fresh data (record counts, descriptions) and
  // drop it when the row is no longer on screen.
  useEffect(() => {
    if (!selectedZone || zones.data === undefined) return;
    const fresh = zones.data.items.find((zone) => zone.id === selectedZone.id);
    if (!fresh) onSelectionChange(null);
    else if (fresh !== selectedZone) onSelectionChange(fresh);
  }, [zones.data, selectedZone, onSelectionChange]);

  const emptyState = zones.isError ? (
    <Box padding={{ vertical: "l" }} data-testid="zones-error">
      <Alert
        type="error"
        header="Hosted zones could not be loaded"
        action={
          <Button onClick={() => void zones.refetch()} loading={zones.isFetching}>
            Retry
          </Button>
        }
      >
        {zones.error.message}
      </Alert>
    </Box>
  ) : isFiltered ? (
    <Box
      textAlign="center"
      color="inherit"
      padding={{ vertical: "l" }}
      data-testid="zones-no-match"
    >
      <SpaceBetween size="s">
        <Box variant="strong" color="inherit">
          No matches
        </Box>
        <Box variant="p" color="inherit">
          We can&apos;t find a match for your filter.
        </Box>
        <Button onClick={() => setQuery(EMPTY_QUERY)}>Clear filter</Button>
      </SpaceBetween>
    </Box>
  ) : (
    <Box textAlign="center" color="inherit" padding={{ vertical: "l" }} data-testid="zones-empty">
      <SpaceBetween size="s">
        <Box variant="strong" color="inherit">
          No hosted zones
        </Box>
        <Box variant="p" color="inherit">
          You don&apos;t have any hosted zones yet.
        </Box>
        {emptyAction}
      </SpaceBetween>
    </Box>
  );

  return (
    <Table<HostedZone>
      data-testid="zones-table"
      variant="full-page"
      stickyHeader
      resizableColumns
      enableKeyboardNavigation
      items={zones.isError ? [] : items}
      trackBy="id"
      columnDefinitions={ZONE_COLUMNS}
      columnDisplay={preferences.contentDisplay}
      wrapLines={preferences.wrapLines}
      stripedRows={preferences.stripedRows}
      loading={loading}
      loadingText="Loading hosted zones"
      selectionType="single"
      selectedItems={selectedZone ? [selectedZone] : []}
      onSelectionChange={({ detail }) => onSelectionChange(detail.selectedItems[0] ?? null)}
      sortingColumn={sortingColumn}
      sortingDescending={sortingDescending}
      onSortingChange={({ detail }) => {
        setSortingColumn(detail.sortingColumn);
        setSortingDescending(detail.isDescending ?? false);
      }}
      totalItemsCount={total}
      firstIndex={(page - 1) * preferences.pageSize + 1}
      renderAriaLive={({ firstIndex, lastIndex, totalItemsCount }) =>
        `Displaying hosted zones ${firstIndex} to ${lastIndex} of ${totalItemsCount}`
      }
      ariaLabels={{
        selectionGroupLabel: "Hosted zone selection",
        itemSelectionLabel: (_, zone) => zone.name,
        tableLabel: "Hosted zones",
      }}
      header={
        <Header
          variant="awsui-h1-sticky"
          counter={zones.data ? `(${formatNumber(total)})` : undefined}
          info={<Link variant="info">Info</Link>}
          actions={actions}
        >
          Hosted zones
        </Header>
      }
      filter={
        <PropertyFilter
          query={query}
          onChange={({ detail }) => setQuery(detail)}
          filteringProperties={ZONE_FILTERING_PROPERTIES}
          filteringOptions={ZONE_FILTERING_OPTIONS}
          filteringPlaceholder="Filter hosted zones by property or value"
          filteringAriaLabel="Filter hosted zones"
          countText={isFiltered && zones.data ? pluralize(total, "match", "matches") : undefined}
          expandToViewport
        />
      }
      pagination={
        <Pagination
          currentPageIndex={page}
          pagesCount={pagesCount}
          onChange={({ detail }) => setPage(detail.currentPageIndex)}
          disabled={zones.isPending}
        />
      }
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={preferences}
          onConfirm={({ detail }) => {
            const next: ZonePreferences = {
              pageSize: detail.pageSize ?? preferences.pageSize,
              wrapLines: detail.wrapLines ?? preferences.wrapLines,
              stripedRows: detail.stripedRows ?? preferences.stripedRows,
              contentDisplay: (detail.contentDisplay ?? preferences.contentDisplay).map(
                (entry) => ({
                  id: entry.id as ZonePreferences["contentDisplay"][number]["id"],
                  visible: entry.visible,
                }),
              ),
            };
            setPreferences(next);
          }}
          pageSizePreference={{
            title: "Page size",
            options: PAGE_SIZE_OPTIONS.map((size) => ({
              value: size,
              label: `${size} hosted zones`,
            })),
          }}
          wrapLinesPreference={{
            label: "Wrap lines",
            description: "Select to see all the text and wrap the lines",
          }}
          stripedRowsPreference={{
            label: "Striped rows",
            description: "Select to add alternating shaded rows",
          }}
          contentDisplayPreference={{
            title: "Column preferences",
            description: "Customize the columns visibility and order.",
            options: CONTENT_DISPLAY_OPTIONS,
          }}
        />
      }
      empty={emptyState}
    />
  );
}
