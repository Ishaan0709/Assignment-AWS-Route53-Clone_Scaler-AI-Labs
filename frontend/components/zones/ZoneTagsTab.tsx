"use client";

import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";
import { TagEditor, rowsFromTags } from "@/components/zones/TagEditor";
import { useNotifications } from "@/hooks/useNotifications";
import { useZoneTags } from "@/hooks/useZoneTags";
import { isApiError } from "@/lib/api";
import { hasTagErrors, tagErrors, tagsToApi, type TagRow } from "@/lib/validators";
import type { HostedZone } from "@/types/api";

interface ZoneTagsTabProps {
  zone: HostedZone;
}

/** Add, remove and save tags. The editor is remounted by the parent after a successful save. */
export function ZoneTagsTab({ zone }: ZoneTagsTabProps) {
  const notify = useNotifications();
  const save = useZoneTags();
  const [rows, setRows] = useState<TagRow[]>(() => rowsFromTags(zone.tags));
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const errors = touched ? tagErrors(rows) : rows.map(() => ({}));

  const onSave = async () => {
    setTouched(true);
    const nextErrors = tagErrors(rows);
    if (hasTagErrors(nextErrors) || save.isPending) return;
    setFormError(null);
    try {
      await save.mutateAsync({ zoneId: zone.id, tags: tagsToApi(rows) });
      notify.success("Hosted zone tags updated successfully.");
    } catch (cause) {
      setFormError(
        isApiError(cause)
          ? (cause.fieldError("tags") ?? cause.message)
          : "Tags could not be saved.",
      );
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
      data-testid="zone-tags"
    >
      <Form
        errorText={formError ?? undefined}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="primary"
              formAction="submit"
              loading={save.isPending}
              disabled={save.isPending}
              data-testid="save-tags"
            >
              Save
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Tags</Header>}>
          <TagEditor rows={rows} errors={errors} onChange={setRows} disabled={save.isPending} />
        </Container>
      </Form>
    </form>
  );
}
