"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RecordForm } from "@/components/records/RecordForm";
import { ConsolePage } from "@/components/layout/ConsolePage";
import { useNotifications } from "@/hooks/useNotifications";
import { useCreateRecords } from "@/hooks/useRecords";
import { useZone } from "@/hooks/useZones";
import { isApiError } from "@/lib/api";
import { APP_TITLE, ROUTES } from "@/lib/constants";
import { displayName, pluralize } from "@/lib/format";
import type { RecordInput } from "@/types/api";

interface CreateRecordPageProps {
  zoneId: string;
}

export function CreateRecordPage({ zoneId }: CreateRecordPageProps) {
  const router = useRouter();
  const notify = useNotifications();
  const zone = useZone(zoneId);
  const create = useCreateRecords();
  const name = zone.data ? displayName(zone.data.name) : zoneId;

  useEffect(() => {
    if (zone.data) document.title = `Create record | ${APP_TITLE}`;
  }, [zone.data]);

  const breadcrumbs = [
    { text: "Hosted zones", href: ROUTES.hostedZones },
    { text: name, href: ROUTES.hostedZone(zoneId) },
    { text: "Create record" },
  ];

  if (zone.isPending) {
    return (
      <ConsolePage title="Create record" breadcrumbs={breadcrumbs}>
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
        </Box>
      </ConsolePage>
    );
  }

  if (zone.isError || !zone.data) {
    const notFound = isApiError(zone.error) && zone.error.isNotFound;
    return (
      <ConsolePage title="Create record" breadcrumbs={breadcrumbs} info={false}>
        <Alert
          type="error"
          header={notFound ? "Hosted zone not found" : "Hosted zone could not be loaded"}
        >
          {notFound ? `No hosted zone with ID ${zoneId} exists.` : zone.error?.message}
        </Alert>
      </ConsolePage>
    );
  }

  const onSubmit = async (records: RecordInput[]) => {
    const created = await create.mutateAsync({ zoneId, records });
    notify.success(`${pluralize(created.length, "record")} created.`);
    router.push(ROUTES.hostedZone(zoneId));
  };

  return (
    <ConsolePage
      title="Create record"
      description={`Create one or more records in ${name}. Use Add another record to submit several at once.`}
      breadcrumbs={breadcrumbs}
    >
      <RecordForm
        zoneName={zone.data.name}
        mode="create"
        submitting={create.isPending || create.isSuccess}
        onSubmit={onSubmit}
        onCancel={() => router.push(ROUTES.hostedZone(zoneId))}
      />
    </ConsolePage>
  );
}
