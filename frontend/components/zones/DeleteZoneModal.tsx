"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { useDeleteZone } from "@/hooks/useZones";
import { displayName } from "@/lib/format";
import type { HostedZone } from "@/types/api";

/** NS + SOA are created with every zone; anything beyond that blocks deletion. */
export const DEFAULT_RECORD_COUNT = 2;

export function hasNonDefaultRecords(zone: HostedZone): boolean {
  return zone.record_count > DEFAULT_RECORD_COUNT;
}

interface DeleteZoneModalProps {
  zone: HostedZone | null;
  onDismiss: () => void;
  onDeleted?: (zone: HostedZone) => void;
}

export function DeleteZoneModal({ zone, onDismiss, onDeleted }: DeleteZoneModalProps) {
  return (
    <Modal
      visible={zone !== null}
      onDismiss={onDismiss}
      header="Delete hosted zone"
      closeAriaLabel="Close"
      data-testid="delete-zone-modal"
    >
      {zone && (
        <DeleteZoneBody key={zone.id} zone={zone} onDismiss={onDismiss} onDeleted={onDeleted} />
      )}
    </Modal>
  );
}

function DeleteZoneBody({
  zone,
  onDismiss,
  onDeleted,
}: {
  zone: HostedZone;
  onDismiss: () => void;
  onDeleted?: (zone: HostedZone) => void;
}) {
  const notify = useNotifications();
  const remove = useDeleteZone();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const blocked = hasNonDefaultRecords(zone);
  const confirmed = confirmation.trim().toLowerCase() === "delete";
  const name = displayName(zone.name);

  const onDelete = async () => {
    if (blocked || !confirmed || remove.isPending) return;
    setError(null);
    try {
      await remove.mutateAsync({ zoneId: zone.id });
      notify.success(`Hosted zone ${name} was successfully deleted.`);
      onDeleted?.(zone);
      onDismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The hosted zone could not be deleted.");
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
        {blocked ? (
          <Alert
            type="error"
            header="Hosted zone cannot be deleted"
            data-testid="delete-zone-blocked"
          >
            The hosted zone <strong>{name}</strong> contains{" "}
            {zone.record_count - DEFAULT_RECORD_COUNT} record
            {zone.record_count - DEFAULT_RECORD_COUNT === 1 ? "" : "s"} other than the default NS
            and SOA records. Delete those records first, then delete the hosted zone.
          </Alert>
        ) : (
          <>
            <Alert type="warning">
              Permanently delete hosted zone <strong>{name}</strong>? This also deletes its default
              NS and SOA records. You can&apos;t undo this action.
            </Alert>
            <Box variant="p">
              If this domain is still in use, DNS resolution will stop working once the hosted zone
              is deleted.
            </Box>
            <FormField
              label={
                <span>
                  To confirm deletion, type <i>delete</i> in the field.
                </span>
              }
              stretch
            >
              <Input
                value={confirmation}
                onChange={({ detail }) => setConfirmation(detail.value)}
                placeholder="delete"
                autoFocus
                ariaLabel="Type delete to confirm"
                data-testid="delete-zone-confirmation"
              />
            </FormField>
          </>
        )}
        {error && <Alert type="error">{error}</Alert>}
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
              disabled={blocked || !confirmed || remove.isPending}
              loading={remove.isPending}
              data-testid="delete-zone-confirm"
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </form>
  );
}
