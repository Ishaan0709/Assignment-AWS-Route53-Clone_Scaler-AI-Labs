"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Modal from "@cloudscape-design/components/modal";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";

const LOG_GROUPS = [
  { value: "", label: "None" },
  { value: "/aws/route53/example", label: "/aws/route53/example" },
  { value: "/aws/route53/audit", label: "/aws/route53/audit" },
];

interface QueryLoggingModalProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Mock configuration. Nothing is sent to CloudWatch. */
export function QueryLoggingModal({ visible, onDismiss }: QueryLoggingModalProps) {
  const notify = useNotifications();
  const [group, setGroup] = useState("");

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Configure query logging"
      closeAriaLabel="Close"
      data-testid="query-logging-modal"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          notify.success(
            "Query logging configuration saved.",
            group
              ? `Mock log group ${group}. This clone does not send logs to CloudWatch.`
              : "Query logging is off. This clone does not send logs to CloudWatch.",
          );
          onDismiss();
        }}
      >
        <SpaceBetween size="m">
          <Box variant="p" color="text-body-secondary">
            Associate a CloudWatch Logs log group to record DNS queries for this hosted zone. Log
            groups below are mocked.
          </Box>
          <FormField label="CloudWatch Logs log group">
            <Select
              data-testid="query-log-group"
              selectedOption={
                LOG_GROUPS.find((item) => item.value === group) ?? LOG_GROUPS[0] ?? null
              }
              options={LOG_GROUPS}
              onChange={({ detail }) => setGroup(detail.selectedOption.value ?? "")}
            />
          </FormField>
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" formAction="none" onClick={onDismiss}>
                Cancel
              </Button>
              <Button variant="primary" formAction="submit" data-testid="query-logging-save">
                Save
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </form>
    </Modal>
  );
}
