"use client";

import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Form from "@cloudscape-design/components/form";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useMemo, useState } from "react";
import { RecordFields } from "@/components/records/RecordFields";
import { isApiError } from "@/lib/api";
import {
  draftFromRecord,
  mapServerFields,
  newDraft,
  validateDrafts,
  type RecordDraft,
  type RecordFieldErrors,
} from "@/lib/recordDraft";
import type { DnsRecord, RecordInput } from "@/types/api";

interface RecordFormProps {
  zoneName: string;
  mode: "create" | "edit";
  /** Required in edit mode. */
  record?: DnsRecord;
  submitting: boolean;
  onSubmit: (records: RecordInput[]) => Promise<void>;
  onCancel: () => void;
}

export function RecordForm({
  zoneName,
  mode,
  record,
  submitting,
  onSubmit,
  onCancel,
}: RecordFormProps) {
  const locked = mode === "edit" && record?.is_default === true;
  const [drafts, setDrafts] = useState<RecordDraft[]>(() =>
    mode === "edit" && record ? [draftFromRecord(record, zoneName)] : [newDraft()],
  );
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<RecordFieldErrors[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const client = useMemo(
    () => (touched ? validateDrafts(drafts, zoneName, { locked }) : null),
    [drafts, locked, touched, zoneName],
  );

  const errors: RecordFieldErrors[] = drafts.map((_, index) => ({
    ...(serverErrors[index] ?? {}),
    ...(client?.errors[index] ?? {}),
  }));

  const update = (index: number, patch: Partial<RecordDraft>) => {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
    setServerErrors((current) =>
      current.map((entry, i) => {
        if (i !== index) return entry;
        const next = { ...entry };
        for (const key of Object.keys(patch) as (keyof RecordDraft)[]) {
          const field = DRAFT_TO_FIELD[key];
          if (field) delete next[field];
        }
        return next;
      }),
    );
    setFormError(null);
  };

  const submit = async () => {
    setTouched(true);
    const result = validateDrafts(drafts, zoneName, { locked });
    if (!result.payloads) {
      setFormError("Fix the highlighted fields and try again.");
      return;
    }
    try {
      await onSubmit(result.payloads);
    } catch (cause) {
      if (isApiError(cause) && Object.keys(cause.fields).length > 0) {
        const mapped = mapServerFields(cause.fields, drafts.length);
        setServerErrors(mapped.records);
        setFormError(mapped.form ?? cause.message);
      } else {
        setFormError(cause instanceof Error ? cause.message : "The record could not be saved.");
      }
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      noValidate
      data-testid="record-form"
    >
      <Form
        errorText={formError ?? undefined}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" formAction="none" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              formAction="submit"
              loading={submitting}
              disabled={submitting}
              data-testid="record-form-submit"
            >
              {mode === "edit" ? "Save" : "Create records"}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {locked ? (
            <Alert type="info" data-testid="record-locked">
              This is the default {record?.type} record for the hosted zone. You can change the TTL,
              the values and the comment. The name and type stay the same, and the record cannot be
              deleted.
            </Alert>
          ) : null}
          {drafts.map((draft, index) => (
            <RecordFields
              key={draft.key}
              index={index}
              draft={draft}
              errors={errors[index] ?? {}}
              zoneName={zoneName}
              locked={locked}
              canRemove={mode === "create" && drafts.length > 1}
              onChange={(patch) => update(index, patch)}
              onRemove={() => {
                setDrafts((current) => current.filter((_, i) => i !== index));
                setServerErrors([]);
              }}
            />
          ))}
          {mode === "create" ? (
            <Button
              formAction="none"
              iconName="add-plus"
              onClick={() => setDrafts((current) => [...current, newDraft()])}
              data-testid="add-record"
            >
              Add another record
            </Button>
          ) : null}
        </SpaceBetween>
      </Form>
    </form>
  );
}

const DRAFT_TO_FIELD: Partial<Record<keyof RecordDraft, keyof RecordFieldErrors>> = {
  name: "name",
  type: "type",
  valuesText: "values",
  ttl: "ttl",
  routingPolicy: "routing_policy",
  setIdentifier: "set_identifier",
  weight: "weight",
  isAlias: "is_alias",
  aliasTarget: "alias_target",
  comment: "comment",
  healthCheckId: "health_check_id",
  region: "set_identifier",
  failover: "set_identifier",
  location: "set_identifier",
};
