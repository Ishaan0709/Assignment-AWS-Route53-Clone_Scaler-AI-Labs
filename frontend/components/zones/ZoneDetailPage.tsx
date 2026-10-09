"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RouterLink } from "@/components/common/RouterLink";
import { ConsolePage } from "@/components/layout/ConsolePage";
import { DeleteZoneModal } from "@/components/zones/DeleteZoneModal";
import { EditZoneModal } from "@/components/zones/EditZoneModal";
import { useZone } from "@/hooks/useZones";
import { isApiError } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { capitalize, displayName, formatDate, formatNumber } from "@/lib/format";

interface ZoneDetailPageProps {
  zoneId: string;
}

/**
 * Hosted zone detail. Phase 5 ships the header, details panel and the edit /
 * delete actions; the records table and tabs arrive in Phase 6.
 */
export function ZoneDetailPage({ zoneId }: ZoneDetailPageProps) {
  const router = useRouter();
  const zone = useZone(zoneId);
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const breadcrumbsBase = [{ text: "Hosted zones", href: ROUTES.hostedZones }];

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

  if (zone.isError) {
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
            : zone.error.message}
        </Alert>
      </ConsolePage>
    );
  }

  const data = zone.data;
  const name = displayName(data.name);

  return (
    <ConsolePage
      title={name}
      breadcrumbs={[...breadcrumbsBase, { text: name }]}
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          <Button onClick={() => setModal("delete")} data-testid="detail-delete-zone">
            Delete zone
          </Button>
          <Button onClick={() => setModal("edit")} data-testid="detail-edit-zone">
            Edit hosted zone
          </Button>
        </SpaceBetween>
      }
    >
      <Container header={<Header variant="h2">Hosted zone details</Header>}>
        <KeyValuePairs
          columns={3}
          items={[
            { label: "Hosted zone name", value: name },
            { label: "Type", value: `${capitalize(data.type)} hosted zone` },
            { label: "Hosted zone ID", value: data.id },
            { label: "Record count", value: formatNumber(data.record_count) },
            { label: "Description", value: data.description || "-" },
            { label: "Created by", value: data.created_by },
            { label: "Created", value: formatDate(data.created_at) },
            { label: "Last updated", value: formatDate(data.updated_at) },
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
            ...(data.type === "private"
              ? [
                  { label: "VPC region", value: data.vpc_region ?? "-" },
                  { label: "VPC ID", value: data.vpc_id ?? "-" },
                ]
              : []),
            {
              label: "Tags",
              value:
                data.tags.length > 0
                  ? data.tags
                      .map((tag) => `${tag.key}${tag.value ? ` = ${tag.value}` : ""}`)
                      .join(", ")
                  : "-",
            },
          ]}
        />
      </Container>
      <Box padding={{ top: "l" }}>
        <Alert type="info" header="Records">
          The records table for this hosted zone is coming in the next release. Go back to the{" "}
          <RouterLink href={ROUTES.hostedZones}>hosted zones list</RouterLink>.
        </Alert>
      </Box>
      <EditZoneModal zone={modal === "edit" ? data : null} onDismiss={() => setModal(null)} />
      <DeleteZoneModal
        zone={modal === "delete" ? data : null}
        onDismiss={() => setModal(null)}
        onDeleted={() => router.push(ROUTES.hostedZones)}
      />
    </ConsolePage>
  );
}
