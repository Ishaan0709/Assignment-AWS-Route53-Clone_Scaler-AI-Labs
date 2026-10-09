"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { useState } from "react";
import { TagEditor, rowsFromTags } from "@/components/zones/TagEditor";
import { useNotifications } from "@/hooks/useNotifications";
import { useUpdateZone } from "@/hooks/useZones";
import { isApiError } from "@/lib/api";
import { capitalize, displayName } from "@/lib/format";
import {
  descriptionError,
  hasTagErrors,
  tagErrors,
  tagsToApi,
  type TagRow,
} from "@/lib/validators";
import type { HostedZone } from "@/types/api";
import { MAX_ZONE_DESCRIPTION } from "@/types/api";

interface EditZoneModalProps {
  zone: HostedZone | null;
  onDismiss: () => void;
  onSaved?: (zone: HostedZone) => void;
}

/** "Edit hosted zone": name and type are read-only; description and tags are editable. */
export function EditZoneModal({ zone, onDismiss, onSaved }: EditZoneModalProps) {
  return (
    <Modal
      visible={zone !== null}
      onDismiss={onDismiss}
      header="Edit hosted zone"
      size="medium"
      closeAriaLabel="Close"
      data-testid="edit-zone-modal"
    >
      {zone && <EditZoneForm key={zone.id} zone={zone} onDismiss={onDismiss} onSaved={onSaved} />}
    </Modal>
  );
}

function EditZoneForm({
  zone,
  onDismiss,
  onSaved,
}: {
  zone: HostedZone;
  onDismiss: () => void;
  onSaved?: (zone: HostedZone) => void;
}) {
  const notify = useNotifications();
  const update = useUpdateZone();
  const [description, setDescription] = useState(zone.description ?? "");
  const [tags, setTags] = useState<TagRow[]>(() => rowsFromTags(zone.tags));
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const descError = submitted
    ? (descriptionError(description) ?? serverErrors.description)
    : undefined;
  const rowErrors = submitted ? tagErrors(tags) : tags.map(() => ({}));
  const tagsError = submitted ? serverErrors.tags : undefined;

  const onSubmit = async () => {
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    if (descriptionError(description) || hasTagErrors(tagErrors(tags))) return;
    try {
      const saved = await update.mutateAsync({
        zoneId: zone.id,
        payload: { description: description.trim() || null, tags: tagsToApi(tags) },
      });
      notify.success("Hosted zone updated successfully", `${displayName(saved.name)} was saved.`);
      onSaved?.(saved);
      onDismiss();
    } catch (error) {
      if (isApiError(error) && Object.keys(error.fields).length > 0) setServerErrors(error.fields);
      else setFormError(error instanceof Error ? error.message : "Something went wrong.");
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <Form
        errorText={formError}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              formAction="none"
              onClick={onDismiss}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              formAction="submit"
              loading={update.isPending}
              disabled={update.isPending}
              data-testid="edit-zone-save"
            >
              Save changes
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <ColumnLayout columns={2} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">Domain name</Box>
              <div>{displayName(zone.name)}</div>
            </div>
            <div>
              <Box variant="awsui-key-label">Type</Box>
              <div>{capitalize(zone.type)} hosted zone</div>
            </div>
          </ColumnLayout>
          <FormField
            label={
              <span>
                Description - <i>optional</i>
              </span>
            }
            description="This value lets you distinguish hosted zones that have the same name."
            constraintText={`The description can have up to ${MAX_ZONE_DESCRIPTION} characters. ${description.length}/${MAX_ZONE_DESCRIPTION}`}
            errorText={descError}
            stretch
          >
            <Textarea
              value={description}
              onChange={({ detail }) => setDescription(detail.value)}
              rows={3}
              ariaLabel="Description"
              data-testid="edit-zone-description"
            />
          </FormField>
          <FormField label="Tags" errorText={tagsError} stretch>
            <TagEditor
              rows={tags}
              errors={rowErrors}
              onChange={setTags}
              disabled={update.isPending}
            />
          </FormField>
          {formError === null && serverErrors.name && (
            <Alert type="error">{serverErrors.name}</Alert>
          )}
        </SpaceBetween>
      </Form>
    </form>
  );
}
