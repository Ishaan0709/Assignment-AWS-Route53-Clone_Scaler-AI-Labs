"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Tabs from "@cloudscape-design/components/tabs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QueryLoggingModal } from "@/components/records/QueryLoggingModal";
import { RecordsTable } from "@/components/records/RecordsTable";
import { TestRecordModal } from "@/components/records/TestRecordModal";
import { ConsolePage } from "@/components/layout/ConsolePage";
import { DeleteZoneModal } from "@/components/zones/DeleteZoneModal";
import { EditZoneModal } from "@/components/zones/EditZoneModal";
import { ExportZoneButton } from "@/components/zones/ExportZoneButton";
import { ZoneTagsTab } from "@/components/zones/ZoneTagsTab";
import { useZone } from "@/hooks/useZones";
import { isApiError } from "@/lib/api";
import { APP_TITLE, ROUTES } from "@/lib/constants";
import { capitalize, displayName, formatDate, formatNumber } from "@/lib/format";

interface ZoneDetailPageProps {
  zoneId: string;
}

type DetailModal = "edit" | "delete" | "test" | "logging" | null;

/** Hosted zone detail: header actions, details, records, DNSSEC placeholder and tags. */
export function ZoneDetailPage({ zoneId }: ZoneDetailPageProps) {
  const router = useRouter();
  const zone = useZone(zoneId);
  const [modal, setModal] = useState<DetailModal>(null);
  const [tab, setTab] = useState("records");
  const breadcrumbsBase = [{ text: "Hosted zones", href: ROUTES.hostedZones }];
  const name = zone.data ? displayName(zone.data.name) : zoneId;

  useEffect(() => {
    if (zone.data) document.title = `${displayName(zone.data.name)} | ${APP_TITLE}`;
  }, [zone.data]);

  if (zone.isPending) {
    return (
      <ConsolePage
        title="Hosted zone"
        breadcrumbs={[...breadcrumbsBase, { text: zoneId }]}
        info={false}
      >
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
        </Box>
      </ConsolePage>
    );
  }

  if (zone.isError || !zone.data) {
    const notFound = isApiError(zone.error) && zone.error.isNotFound;
    return (
      <ConsolePage
        title="Hosted zone"
        breadcrumbs={[...breadcrumbsBase, { text: zoneId }]}
        info={false}
      >
        <Alert
          type="error"
          header={notFound ? "Hosted zone not found" : "Hosted zone could not be loaded"}
          action={
            notFound ? (
              <Button onClick={() => router.push(ROUTES.hostedZones)}>Back to hosted zones</Button>
            ) : (
              <Button onClick={() => void zone.refetch()}>Retry</Button>
            )
          }
        >
          {notFound
            ? `No hosted zone with ID ${zoneId} exists in this account.`
            : (zone.error?.message ?? "Unknown error")}
        </Alert>
      </ConsolePage>
    );
  }

  const data = zone.data;

  return (
    <ConsolePage
      title={name}
      breadcrumbs={[...breadcrumbsBase, { text: name }]}
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={() => setModal("delete")} data-testid="detail-delete-zone">
            Delete zone
          </Button>
          <Button onClick={() => setModal("test")} data-testid="test-record">
            Test record
          </Button>
          <Button onClick={() => setModal("logging")} data-testid="configure-query-logging">
            Configure query logging
          </Button>
          <ExportZoneButton zoneId={data.id} fileBase={name} />
          <Button onClick={() => setModal("edit")} data-testid="detail-edit-zone">
            Edit hosted zone
          </Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        <ExpandableSection
          headerText="Hosted zone details"
          defaultExpanded
          data-testid="zone-details"
        >
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Hosted zone name", value: name },
              { label: "Type", value: `${capitalize(data.type)} hosted zone` },
              { label: "Hosted zone ID", value: data.id },
              { label: "Description", value: data.description || "-" },
              { label: "Record count", value: formatNumber(data.record_count) },
              {
                label: "Name servers",
                value:
                  data.name_servers.length > 0 ? (
                    <SpaceBetween size="xxs">
                      {data.name_servers.map((ns) => (
                        <Box key={ns} fontSize="body-s">
                          {ns}
                        </Box>
                      ))}
                    </SpaceBetween>
                  ) : (
                    "-"
                  ),
              },
              { label: "Created by", value: data.created_by },
              { label: "Created", value: formatDate(data.created_at) },
              ...(data.type === "private"
                ? [
                    { label: "VPC region", value: data.vpc_region ?? "-" },
                    { label: "VPC ID", value: data.vpc_id ?? "-" },
                  ]
                : []),
            ]}
          />
        </ExpandableSection>
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => setTab(detail.activeTabId)}
          tabs={[
            {
              id: "records",
              label: `Records (${formatNumber(data.record_count)})`,
              content: tab === "records" ? <RecordsTable zoneId={data.id} /> : null,
            },
            {
              id: "dnssec",
              label: "DNSSEC signing",
              content:
                tab === "dnssec" ? (
                  <Container data-testid="dnssec-placeholder">
                    <Box variant="p" color="text-body-secondary">
                      DNSSEC signing is coming soon.
                    </Box>
                  </Container>
                ) : null,
            },
            {
              id: "tags",
              label: `Hosted zone tags (${formatNumber(data.tags.length)})`,
              content:
                tab === "tags" ? (
                  <ZoneTagsTab key={`${data.id}-${data.updated_at}`} zone={data} />
                ) : null,
            },
          ]}
        />
      </SpaceBetween>
      <EditZoneModal zone={modal === "edit" ? data : null} onDismiss={() => setModal(null)} />
      <DeleteZoneModal
        zone={modal === "delete" ? data : null}
        onDismiss={() => setModal(null)}
        onDeleted={() => router.push(ROUTES.hostedZones)}
      />
      <TestRecordModal
        zoneName={data.name}
        visible={modal === "test"}
        onDismiss={() => setModal(null)}
      />
      <QueryLoggingModal visible={modal === "logging"} onDismiss={() => setModal(null)} />
    </ConsolePage>
  );
}
