"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { useDeleteRecords } from "@/hooks/useRecords";
import { displayName, pluralize } from "@/lib/format";
import type { DnsRecord } from "@/types/api";

interface DeleteRecordsModalProps {
  zoneId: string;
  /** Empty array hides the modal. */
  records: DnsRecord[];
  onDismiss: () => void;
  onDeleted?: () => void;
}

export function DeleteRecordsModal({
  zoneId,
  records,
  onDismiss,
  onDeleted,
}: DeleteRecordsModalProps) {
  return (
    <Modal
      visible={records.length > 0}
      onDismiss={onDismiss}
      header="Delete records?"
      closeAriaLabel="Close"
      data-testid="delete-records-modal"
    >
      {records.length > 0 ? (
        <DeleteRecordsBody
          key={records.map((record) => record.id).join(",")}
          zoneId={zoneId}
          records={records}
          onDismiss={onDismiss}
          onDeleted={onDeleted}
        />
      ) : null}
    </Modal>
  );
}

function DeleteRecordsBody({
  zoneId,
  records,
  onDismiss,
  onDeleted,
}: {
  zoneId: string;
  records: DnsRecord[];
  onDismiss: () => void;
  onDeleted?: () => void;
}) {
  const notify = useNotifications();
  const remove = useDeleteRecords();
  const [error, setError] = useState<string | null>(null);
  const blocked = records.filter((record) => record.is_default);
  const deletable = records.filter((record) => !record.is_default);

  const onDelete = async () => {
    if (deletable.length === 0 || remove.isPending) return;
    setError(null);
    try {
      const result = await remove.mutateAsync({
        zoneId,
        ids: deletable.map((record) => record.id),
      });
      const skipped = result.skipped + blocked.length;
      const header = `${pluralize(result.deleted, "record")} deleted`;
      const notes = [
        skipped > 0
          ? `${pluralize(skipped, "record")} skipped because the default NS and SOA records cannot be deleted.`
          : "",
        result.not_found > 0 ? `${pluralize(result.not_found, "record")} could not be found.` : "",
      ].filter(Boolean);
      if (result.deleted > 0) notify.success(header, notes.join(" ") || undefined);
      else notify.warning(header, notes.join(" ") || "Nothing was deleted.");
      onDeleted?.();
      onDismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The records could not be deleted.");
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onDelete();
      }}
    >
      <SpaceBetween size="m">
        {blocked.length > 0 ? (
          <Alert type="error" header="Default records cannot be deleted">
            The apex NS and SOA records were created with the hosted zone and cannot be deleted.
          </Alert>
        ) : (
          <Alert type="warning">
            Deleted records stop resolving as soon as resolvers honor the change. This cannot be
            undone.
          </Alert>
        )}
        <Box>
          <ul>
            {records.map((record) => (
              <li key={record.id}>
                {displayName(record.name)} {record.type}
                {record.is_default ? " (default)" : ""}
              </li>
            ))}
          </ul>
        </Box>
        {error ? <Alert type="error">{error}</Alert> : null}
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              formAction="none"
              onClick={onDismiss}
              disabled={remove.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              formAction="submit"
              loading={remove.isPending}
              disabled={deletable.length === 0 || remove.isPending}
              data-testid="delete-records-confirm"
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </form>
  );
}
