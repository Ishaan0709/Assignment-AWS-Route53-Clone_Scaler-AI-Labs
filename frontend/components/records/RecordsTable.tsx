"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Pagination from "@cloudscape-design/components/pagination";
import type { PropertyFilterProps } from "@cloudscape-design/components/property-filter";
import PropertyFilter from "@cloudscape-design/components/property-filter";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { TableProps } from "@cloudscape-design/components/table";
import Table from "@cloudscape-design/components/table";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DeleteRecordsModal } from "@/components/records/DeleteRecordsModal";
import { ImportZoneModal } from "@/components/records/ImportZoneModal";
import {
  ALIAS_FILTER_OPTIONS,
  DEFAULT_RECORD_PREFERENCES,
  EMPTY_RECORD_QUERY,
  POLICY_FILTER_OPTIONS,
  RECORD_COLUMNS,
  RECORD_CONTENT_DISPLAY,
  RECORD_FILTERING_PROPERTIES,
  RECORD_PAGE_SIZES,
  TYPE_FILTER_OPTIONS,
  isRecordPreferences,
  isRecordSortField,
  queryToRecordParams,
  type RecordPreferences,
} from "@/components/records/recordColumns";
import styles from "@/components/records/recordForm.module.css";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { RecordListParams } from "@/hooks/useRecords";
import { useRecords } from "@/hooks/useRecords";
import { ROUTES, STORAGE_KEYS } from "@/lib/constants";
import { displayName, formatNumber, pluralize } from "@/lib/format";
import type { DnsRecord, RecordSortField, RecordType, RoutingPolicy } from "@/types/api";

interface RecordsTableProps {
  zoneId: string;
}

function optionOf<T extends string>(
  options: readonly { value: T | ""; label: string }[],
  value: T | "",
): { value: string; label: string } {
  return options.find((option) => option.value === value) ?? options[0] ?? { value: "", label: "" };
}

export function RecordsTable({ zoneId }: RecordsTableProps) {
  const router = useRouter();
  const [preferences, setPreferences] = usePersistedState<RecordPreferences>(
    STORAGE_KEYS.recordsPreferences,
    DEFAULT_RECORD_PREFERENCES,
    isRecordPreferences,
  );
  const [query, setQuery] = useState<PropertyFilterProps.Query>(EMPTY_RECORD_QUERY);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [typeFilter, setTypeFilter] = useState<RecordType | "">("");
  const [policyFilter, setPolicyFilter] = useState<RoutingPolicy | "">("");
  const [aliasFilter, setAliasFilter] = useState<"" | "true" | "false">("");
  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<DnsRecord>>();
  const [sortingDescending, setSortingDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DnsRecord[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const textParams = useMemo(() => queryToRecordParams(debouncedQuery), [debouncedQuery]);
  const isFiltered =
    debouncedQuery.tokens.length > 0 ||
    typeFilter !== "" ||
    policyFilter !== "" ||
    aliasFilter !== "";

  useEffect(() => {
    setPage(1);
  }, [
    textParams,
    typeFilter,
    policyFilter,
    aliasFilter,
    sortingColumn,
    sortingDescending,
    preferences.pageSize,
  ]);

  const sortField: RecordSortField | undefined =
    sortingColumn && isRecordSortField(sortingColumn.sortingField)
      ? sortingColumn.sortingField
      : undefined;

  const params: RecordListParams = {
    ...textParams,
    zoneId,
    type: typeFilter || undefined,
    routing_policy: policyFilter || undefined,
    alias: aliasFilter === "" ? undefined : aliasFilter === "true",
    page,
    page_size: preferences.pageSize,
    sort: sortField,
    order: sortField ? (sortingDescending ? "desc" : "asc") : undefined,
  };

  const records = useRecords(params);
  const total = records.data?.total ?? 0;
  const items = records.data?.items ?? [];
  const pagesCount = Math.max(1, Math.ceil(total / preferences.pageSize));
  const loading = records.isPending || (records.isFetching && records.isPlaceholderData);

  useEffect(() => {
    if (!records.isPending && page > pagesCount) setPage(pagesCount);
  }, [page, pagesCount, records.isPending]);

  useEffect(() => {
    if (!records.data) return;
    const fresh = records.data.items;
    setSelected((current) =>
      current.flatMap((item) => {
        const next = fresh.find((row) => row.id === item.id);
        return next ? [next] : [];
      }),
    );
  }, [records.data]);

  const clearFilters = () => {
    setQuery(EMPTY_RECORD_QUERY);
    setTypeFilter("");
    setPolicyFilter("");
    setAliasFilter("");
  };

  const emptyState = records.isError ? (
    <Box padding={{ vertical: "l" }} data-testid="records-error">
      <Alert
        type="error"
        header="Records could not be loaded"
        action={
          <Button onClick={() => void records.refetch()} loading={records.isFetching}>
            Retry
          </Button>
        }
      >
        {records.error.message}
      </Alert>
    </Box>
  ) : isFiltered ? (
    <Box
      textAlign="center"
      color="inherit"
      padding={{ vertical: "l" }}
      data-testid="records-no-match"
    >
      <SpaceBetween size="s">
        <Box variant="strong" color="inherit">
          No matches
        </Box>
        <Box variant="p" color="inherit">
          We can&apos;t find a match for your filter.
        </Box>
        <Button onClick={clearFilters}>Clear filter</Button>
      </SpaceBetween>
    </Box>
  ) : (
    <Box textAlign="center" color="inherit" padding={{ vertical: "l" }} data-testid="records-empty">
      <SpaceBetween size="s">
        <Box variant="strong" color="inherit">
          No records
        </Box>
        <Box variant="p" color="inherit">
          This hosted zone doesn&apos;t have any records yet.
        </Box>
        <Button variant="primary" onClick={() => router.push(ROUTES.createRecord(zoneId))}>
          Create record
        </Button>
      </SpaceBetween>
    </Box>
  );

  const typeOption = optionOf(TYPE_FILTER_OPTIONS, typeFilter);
  const policyOption = optionOf(POLICY_FILTER_OPTIONS, policyFilter);
  const aliasOption = optionOf(ALIAS_FILTER_OPTIONS, aliasFilter);

  return (
    <>
      <Table<DnsRecord>
        data-testid="records-table"
        variant="embedded"
        stickyHeader
        resizableColumns
        enableKeyboardNavigation
        items={records.isError ? [] : items}
        trackBy="id"
        columnDefinitions={RECORD_COLUMNS}
        columnDisplay={preferences.contentDisplay}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        loading={loading}
        loadingText="Loading records"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={({ detail }) => {
          setSortingColumn(detail.sortingColumn);
          setSortingDescending(detail.isDescending ?? false);
        }}
        totalItemsCount={total}
        firstIndex={(page - 1) * preferences.pageSize + 1}
        renderAriaLive={({ firstIndex, lastIndex, totalItemsCount }) =>
          `Displaying records ${firstIndex} to ${lastIndex} of ${totalItemsCount}`
        }
        ariaLabels={{
          selectionGroupLabel: "Record selection",
          allItemsSelectionLabel: () => "Select all records",
          itemSelectionLabel: (_, record) =>
            `${displayName(record.name)} ${record.type}${record.is_default ? " (default)" : ""}`,
          tableLabel: "Records",
        }}
        header={
          <Header
            variant="h2"
            counter={records.data ? `(${formatNumber(total)})` : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  disabled={!selected.some((record) => !record.is_default)}
                  onClick={() => setDeleteOpen(true)}
                  data-testid="delete-record"
                >
                  Delete record
                </Button>
                <Button onClick={() => setImportOpen(true)} data-testid="import-zone-file">
                  Import zone file
                </Button>
                <Button
                  disabled={selected.length !== 1}
                  onClick={() => {
                    const record = selected[0];
                    if (record) router.push(ROUTES.editRecord(zoneId, record.id));
                  }}
                  data-testid="edit-record"
                >
                  Edit record
                </Button>
                <Button
                  variant="primary"
                  onClick={() => router.push(ROUTES.createRecord(zoneId))}
                  data-testid="create-record"
                >
                  Create record
                </Button>
              </SpaceBetween>
            }
          >
            Records
          </Header>
        }
        filter={
          <div className={styles.filters} data-testid="records-filter" data-hotkey-filter>
            <div className={styles.property}>
              <PropertyFilter
                query={query}
                onChange={({ detail }) => setQuery(detail)}
                filteringProperties={RECORD_FILTERING_PROPERTIES}
                filteringPlaceholder="Filter records by property or value"
                filteringAriaLabel="Filter records"
                countText={
                  isFiltered && records.data ? pluralize(total, "match", "matches") : undefined
                }
                expandToViewport
              />
            </div>
            <div className={styles.select}>
              <Select
                data-testid="record-type-filter"
                ariaLabel="Type"
                selectedOption={typeOption}
                options={[...TYPE_FILTER_OPTIONS]}
                onChange={({ detail }) =>
                  setTypeFilter((detail.selectedOption.value ?? "") as RecordType | "")
                }
              />
            </div>
            <div className={styles.select}>
              <Select
                data-testid="record-policy-filter"
                ariaLabel="Routing policy"
                selectedOption={policyOption}
                options={[...POLICY_FILTER_OPTIONS]}
                onChange={({ detail }) =>
                  setPolicyFilter((detail.selectedOption.value ?? "") as RoutingPolicy | "")
                }
              />
            </div>
            <div className={styles.select}>
              <Select
                data-testid="record-alias-filter"
                ariaLabel="Alias"
                selectedOption={aliasOption}
                options={[...ALIAS_FILTER_OPTIONS]}
                onChange={({ detail }) =>
                  setAliasFilter((detail.selectedOption.value ?? "") as "" | "true" | "false")
                }
              />
            </div>
          </div>
        }
        pagination={
          <Pagination
            currentPageIndex={page}
            pagesCount={pagesCount}
            onChange={({ detail }) => setPage(detail.currentPageIndex)}
            disabled={records.isPending}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={preferences}
            onConfirm={({ detail }) => {
              const next: RecordPreferences = {
                pageSize: detail.pageSize ?? preferences.pageSize,
                wrapLines: detail.wrapLines ?? preferences.wrapLines,
                stripedRows: detail.stripedRows ?? preferences.stripedRows,
                contentDisplay: (detail.contentDisplay ?? preferences.contentDisplay).map(
                  (entry) => ({
                    id: entry.id as RecordPreferences["contentDisplay"][number]["id"],
                    visible: entry.visible,
                  }),
                ),
              };
              setPreferences(next);
            }}
            pageSizePreference={{
              title: "Page size",
              options: RECORD_PAGE_SIZES.map((size) => ({
                value: size,
                label: `${size} records`,
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
              description: "Customize the columns in this table",
              options: RECORD_CONTENT_DISPLAY,
            }}
          />
        }
        empty={emptyState}
      />
      <DeleteRecordsModal
        zoneId={zoneId}
        records={deleteOpen ? selected : []}
        onDismiss={() => setDeleteOpen(false)}
        onDeleted={() => setSelected([])}
      />
      <ImportZoneModal
        zoneId={zoneId}
        visible={importOpen}
        onDismiss={() => setImportOpen(false)}
      />
    </>
  );
}
