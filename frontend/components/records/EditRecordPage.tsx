"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Spinner from "@cloudscape-design/components/spinner";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RecordForm } from "@/components/records/RecordForm";
import { ConsolePage } from "@/components/layout/ConsolePage";
import { useNotifications } from "@/hooks/useNotifications";
import { useRecord, useUpdateRecord } from "@/hooks/useRecords";
import { useZone } from "@/hooks/useZones";
import { isApiError } from "@/lib/api";
import { APP_TITLE, ROUTES } from "@/lib/constants";
import { displayName } from "@/lib/format";
import type { RecordInput } from "@/types/api";

interface EditRecordPageProps {
  zoneId: string;
  recordId: number;
}

export function EditRecordPage({ zoneId, recordId }: EditRecordPageProps) {
  const router = useRouter();
  const notify = useNotifications();
  const zone = useZone(zoneId);
  const record = useRecord(zoneId, recordId);
  const update = useUpdateRecord();
  const zoneLabel = zone.data ? displayName(zone.data.name) : zoneId;
  const validId = Number.isInteger(recordId) && recordId > 0;

  useEffect(() => {
    if (zone.data) document.title = `Edit record | ${APP_TITLE}`;
  }, [zone.data]);

  const breadcrumbs = [
    { text: "Hosted zones", href: ROUTES.hostedZones },
    { text: zoneLabel, href: ROUTES.hostedZone(zoneId) },
    { text: "Edit record" },
  ];

  if (!validId) {
    return (
      <ConsolePage title="Edit record" breadcrumbs={breadcrumbs} info={false}>
        <Alert type="error" header="Record not found">
          The record id is not valid.
        </Alert>
      </ConsolePage>
    );
  }

  if (zone.isPending || record.isPending) {
    return (
      <ConsolePage title="Edit record" breadcrumbs={breadcrumbs}>
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
        </Box>
      </ConsolePage>
    );
  }

  if (zone.isError || !zone.data) {
    return (
      <ConsolePage title="Edit record" breadcrumbs={breadcrumbs} info={false}>
        <Alert type="error" header="Hosted zone could not be loaded">
          {zone.error?.message ?? "Unknown error"}
        </Alert>
      </ConsolePage>
    );
  }

  if (record.isError || !record.data) {
    const notFound = isApiError(record.error) && record.error.isNotFound;
    return (
      <ConsolePage title="Edit record" breadcrumbs={breadcrumbs} info={false}>
        <Alert
          type="error"
          header={notFound ? "Record not found" : "Record could not be loaded"}
          action={<Button onClick={() => void record.refetch()}>Retry</Button>}
        >
          {notFound
            ? `No record with ID ${recordId} exists in this hosted zone.`
            : record.error?.message}
        </Alert>
      </ConsolePage>
    );
  }

  const onSubmit = async (records: RecordInput[]) => {
    const payload = records[0];
    if (!payload) return;
    await update.mutateAsync({ zoneId, recordId, payload });
    notify.success("Record updated successfully.");
    router.push(ROUTES.hostedZone(zoneId));
  };

  return (
    <ConsolePage
      title="Edit record"
      description={`${displayName(record.data.name)} ${record.data.type}`}
      breadcrumbs={breadcrumbs}
    >
      <RecordForm
        key={record.data.updated_at}
        zoneName={zone.data.name}
        mode="edit"
        record={record.data}
        submitting={update.isPending || update.isSuccess}
        onSubmit={onSubmit}
        onCancel={() => router.push(ROUTES.hostedZone(zoneId))}
      />
    </ConsolePage>
  );
}
