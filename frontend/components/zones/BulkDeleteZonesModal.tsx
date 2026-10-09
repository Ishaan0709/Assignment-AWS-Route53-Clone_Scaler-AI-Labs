"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { useDeleteZone } from "@/hooks/useZones";
import { isApiError } from "@/lib/api";
import { displayName, pluralize } from "@/lib/format";
import type { HostedZone } from "@/types/api";

interface DeleteResult {
  id: string;
  name: string;
  ok: boolean;
  message: string;
}

interface BulkDeleteZonesModalProps {
  zones: HostedZone[];
  onDismiss: () => void;
  onFinished: () => void;
}

/** Deletes several hosted zones one request at a time and reports each result. */
export function BulkDeleteZonesModal({ zones, onDismiss, onFinished }: BulkDeleteZonesModalProps) {
  return (
    <Modal
      visible={zones.length > 1}
      onDismiss={onDismiss}
      header={`Delete ${pluralize(zones.length, "hosted zone")}`}
      closeAriaLabel="Close"
      data-testid="bulk-delete-zones-modal"
    >
      {zones.length > 1 ? (
        <BulkDeleteBody
          key={zones.map((zone) => zone.id).join(",")}
          zones={zones}
          onDismiss={onDismiss}
          onFinished={onFinished}
        />
      ) : null}
    </Modal>
  );
}

function BulkDeleteBody({
  zones,
  onDismiss,
  onFinished,
}: {
  zones: HostedZone[];
  onDismiss: () => void;
  onFinished: () => void;
}) {
  const notify = useNotifications();
  const remove = useDeleteZone();
  const [results, setResults] = useState<DeleteResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const onDelete = async () => {
    if (running) return;
    setRunning(true);
    const next: DeleteResult[] = [];
    for (const zone of zones) {
      try {
        await remove.mutateAsync({ zoneId: zone.id });
        next.push({
          id: zone.id,
          name: displayName(zone.name),
          ok: true,
          message: "Deleted",
        });
      } catch (cause) {
        next.push({
          id: zone.id,
          name: displayName(zone.name),
          ok: false,
          message: isApiError(cause) ? cause.message : "The hosted zone could not be deleted.",
        });
      }
    }
    setResults(next);
    setRunning(false);
    const failed = next.filter((item) => !item.ok).length;
    if (failed === 0) {
      notify.success(`${pluralize(next.length, "hosted zone")} deleted.`);
      onFinished();
      onDismiss();
    }
  };

  return (
    <SpaceBetween size="m">
      <Box variant="p">
        Zones that still have records other than the default NS and SOA records are left in place
        and reported below.
      </Box>
      <ul>
        {(
          results ??
          zones.map((zone) => ({
            id: zone.id,
            name: displayName(zone.name),
            ok: true,
            message: "",
          }))
        ).map((item) => (
          <li key={item.id} data-testid={`bulk-delete-result-${item.id}`}>
            {item.name}
            {item.message ? ` — ${item.message}` : ""}
          </li>
        ))}
      </ul>
      {results?.some((item) => !item.ok) ? (
        <Alert type="error">Some hosted zones could not be deleted.</Alert>
      ) : null}
      <Box float="right">
        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={onDismiss} disabled={running}>
            {results ? "Close" : "Cancel"}
          </Button>
          {results ? null : (
            <Button
              variant="primary"
              loading={running}
              onClick={() => void onDelete()}
              data-testid="bulk-delete-confirm"
            >
              Delete
            </Button>
          )}
        </SpaceBetween>
      </Box>
    </SpaceBetween>
  );
}
