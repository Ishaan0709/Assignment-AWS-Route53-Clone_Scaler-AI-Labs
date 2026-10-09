"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState } from "react";
import { displayName } from "@/lib/format";
import { USER_RECORD_TYPES, type RecordType } from "@/types/api";

const MOCK_ANSWERS: Record<string, string> = {
  A: "192.0.2.1",
  AAAA: "2001:db8::1",
  CNAME: "target.example.net.",
  TXT: '"v=spf1 -all"',
  MX: "10 mail.example.net.",
  NS: "ns-1.awsdns-01.org.",
  PTR: "host.example.net.",
  SRV: "10 5 5060 sip.example.net.",
  CAA: '0 issue "letsencrypt.org"',
};

interface TestRecordModalProps {
  zoneName: string;
  visible: boolean;
  onDismiss: () => void;
}

/** Mock DNS lookup. This clone does not query real resolvers. */
export function TestRecordModal({ zoneName, visible, onDismiss }: TestRecordModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<RecordType>("A");
  const [answer, setAnswer] = useState<string | null>(null);
  const zoneLabel = displayName(zoneName);
  const fqdn = name.trim() ? `${name.trim()}.${zoneLabel}` : zoneLabel;

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Test record"
      closeAriaLabel="Close"
      data-testid="test-record-modal"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const sample = MOCK_ANSWERS[type] ?? "-";
          setAnswer(
            `${fqdn} ${type} → ${sample}. This is a mocked response; the clone does not query DNS.`,
          );
        }}
      >
        <SpaceBetween size="m">
          <FormField label="Record name" description={`Leave blank to test ${zoneLabel}.`}>
            <Input
              value={name}
              placeholder="www"
              data-testid="test-record-name"
              onChange={({ detail }) => {
                setName(detail.value);
                setAnswer(null);
              }}
            />
          </FormField>
          <FormField label="Record type">
            <Select
              data-testid="test-record-type"
              selectedOption={{ value: type, label: type }}
              options={USER_RECORD_TYPES.map((item) => ({ value: item, label: item }))}
              onChange={({ detail }) => {
                setType((detail.selectedOption.value ?? "A") as RecordType);
                setAnswer(null);
              }}
            />
          </FormField>
          {answer ? (
            <Box variant="code" data-testid="test-record-answer">
              {answer}
            </Box>
          ) : null}
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" formAction="none" onClick={onDismiss}>
                Close
              </Button>
              <Button variant="primary" formAction="submit" data-testid="test-record-run">
                Test
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </form>
    </Modal>
  );
}
