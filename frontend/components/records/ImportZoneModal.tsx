"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FileUpload from "@cloudscape-design/components/file-upload";
import FormField from "@cloudscape-design/components/form-field";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";
import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { useImportZoneFile } from "@/hooks/useZoneFile";
import { isApiError } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { importTypeBreakdown } from "@/lib/importPreview";
import type { ImportSummary } from "@/types/api";

interface ImportZoneModalProps {
  zoneId: string;
  visible: boolean;
  onDismiss: () => void;
}

export function ImportZoneModal({ zoneId, visible, onDismiss }: ImportZoneModalProps) {
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Import zone file"
      size="large"
      closeAriaLabel="Close"
      data-testid="import-zone-modal"
    >
      {visible ? <ImportZoneBody key={zoneId} zoneId={zoneId} onDismiss={onDismiss} /> : null}
    </Modal>
  );
}

function ImportZoneBody({ zoneId, onDismiss }: { zoneId: string; onDismiss: () => void }) {
  const notify = useNotifications();
  const importer = useImportZoneFile();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (dryRun: boolean) => {
    setError(null);
    const file = files[0] ?? null;
    if (!file && !text.trim()) {
      setError("Upload a zone file or paste its contents.");
      return;
    }
    try {
      const summary = await importer.mutateAsync({ zoneId, file, text, dryRun });
      if (dryRun) {
        setPreview(summary);
        return;
      }
      const problems =
        summary.errors.length > 0
          ? `${pluralize(summary.errors.length, "error")} reported.`
          : undefined;
      notify.success(
        `Imported ${pluralize(summary.imported, "record")}. ${pluralize(summary.skipped, "record")} skipped.`,
        problems,
      );
      onDismiss();
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : "The zone file could not be imported.");
    }
  };

  const byType = preview ? importTypeBreakdown(preview.records) : "";

  return (
    <SpaceBetween size="m">
      <Box variant="p" color="text-body-secondary">
        Upload a BIND zone file or paste it below. Parse shows a dry run: records that would be
        created, records that would be skipped, and errors with line numbers. Confirm writes the
        import.
      </Box>
      <FormField
        label="Zone file"
        constraintText="UTF-8 text, up to 1 MB. SOA and apex NS lines are skipped."
      >
        <FileUpload
          value={files}
          onChange={({ detail }) => {
            setFiles(detail.value);
            setPreview(null);
          }}
          accept=".zone,.txt,.bind,text/plain"
          data-testid="import-file"
          i18nStrings={{
            uploadButtonText: () => "Choose file",
            dropzoneText: () => "Drop a zone file to upload",
            removeFileAriaLabel: (index) => `Remove file ${index + 1}`,
            limitShowFewer: "Show fewer",
            limitShowMore: "Show more",
            errorIconAriaLabel: "Error",
          }}
        />
      </FormField>
      <FormField label="Or paste zone file contents">
        <Textarea
          value={text}
          rows={6}
          placeholder={"www 300 IN A 192.0.2.1"}
          data-testid="import-text"
          onChange={({ detail }) => {
            setText(detail.value);
            setPreview(null);
          }}
        />
      </FormField>
      {error ? <Alert type="error">{error}</Alert> : null}
      {preview ? (
        <SpaceBetween size="s">
          <Alert type={preview.errors.length > 0 ? "warning" : "info"} data-testid="import-summary">
            {`${pluralize(preview.imported, "record")} ready to import. ${pluralize(preview.skipped, "record")} skipped. ${pluralize(preview.errors.length, "error")}.`}
            {byType ? ` By type: ${byType}.` : ""}
          </Alert>
          {preview.errors.length > 0 ? (
            <Box data-testid="import-errors">
              {preview.errors.map((item, index) => (
                <div key={`${item.line ?? "x"}-${index}`}>
                  {item.line === null ? item.message : `Line ${item.line}: ${item.message}`}
                </div>
              ))}
            </Box>
          ) : null}
          <Table
            variant="embedded"
            trackBy={(item) => `${item.line ?? "x"}-${item.name}-${item.type}`}
            items={preview.records}
            columnDefinitions={[
              { id: "line", header: "Line", cell: (item) => item.line ?? "-" },
              { id: "name", header: "Name", cell: (item) => item.name },
              { id: "type", header: "Type", cell: (item) => item.type },
              { id: "ttl", header: "TTL", cell: (item) => item.ttl ?? "-" },
              { id: "values", header: "Value", cell: (item) => item.values.join(", ") || "-" },
              {
                id: "status",
                header: "Status",
                cell: (item) => item.reason ?? item.status,
              },
            ]}
            empty={<Box textAlign="center">No records in this file.</Box>}
          />
        </SpaceBetween>
      ) : null}
      <Box float="right">
        <SpaceBetween direction="horizontal" size="xs">
          <Button variant="link" onClick={onDismiss} disabled={importer.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void run(true)}
            loading={importer.isPending && importer.variables?.dryRun === true}
            data-testid="import-parse"
          >
            Parse
          </Button>
          <Button
            variant="primary"
            disabled={!preview || preview.imported === 0 || importer.isPending}
            loading={importer.isPending && importer.variables?.dryRun === false}
            onClick={() => void run(false)}
            data-testid="import-confirm"
          >
            Confirm
          </Button>
        </SpaceBetween>
      </Box>
    </SpaceBetween>
  );
}
