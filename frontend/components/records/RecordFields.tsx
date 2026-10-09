"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";
import styles from "@/components/records/recordForm.module.css";
import { displayName } from "@/lib/format";
import {
  ALIAS_ENDPOINTS,
  FAILOVER_OPTIONS,
  GEO_LOCATIONS,
  LATENCY_REGIONS,
  RECORD_TYPE_META,
  ROUTING_HELPER,
  TTL_PRESETS,
} from "@/lib/recordOptions";
import type { RecordDraft, RecordFieldErrors } from "@/lib/recordDraft";
import { ensureDot } from "@/lib/recordValidators";
import { ALIAS_TYPES, USER_RECORD_TYPES, type RecordType, type RoutingPolicy } from "@/types/api";

interface RecordFieldsProps {
  index: number;
  draft: RecordDraft;
  errors: RecordFieldErrors;
  zoneName: string;
  /** Default apex NS/SOA: only TTL, values and comment can change. */
  locked: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<RecordDraft>) => void;
  onRemove: () => void;
}

function selected(value: string, label: string) {
  return { value, label };
}

export function RecordFields({
  index,
  draft,
  errors,
  zoneName,
  locked,
  canRemove,
  onChange,
  onRemove,
}: RecordFieldsProps) {
  const meta = RECORD_TYPE_META[draft.type];
  const zoneLabel = displayName(zoneName);
  const aliasAllowed = (ALIAS_TYPES as readonly string[]).includes(draft.type);
  const showAlias = aliasAllowed && draft.isAlias && !locked;
  const typeChoices = locked ? [draft.type] : USER_RECORD_TYPES;
  const presetId = TTL_PRESETS.some((preset) => preset.id === draft.ttl) ? draft.ttl : null;

  const apexTarget = ensureDot(zoneName.toLowerCase());
  const aliasOptions = [
    ...ALIAS_ENDPOINTS.map((endpoint) => ({
      label: endpoint.label,
      value: endpoint.value,
      description: endpoint.description,
    })),
    {
      label: "Another record in this hosted zone",
      value: apexTarget,
      description: zoneLabel,
    },
  ];
  if (draft.aliasTarget && !aliasOptions.some((option) => option.value === draft.aliasTarget)) {
    aliasOptions.unshift({
      label: draft.aliasTarget,
      value: draft.aliasTarget,
      description: "Current target",
    });
  }
  const aliasOption = aliasOptions.find((option) => option.value === draft.aliasTarget) ?? null;

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            canRemove ? (
              <Button formAction="none" onClick={onRemove} data-testid={`remove-record-${index}`}>
                Remove
              </Button>
            ) : undefined
          }
        >
          {locked ? "Record" : `Record ${index + 1}`}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <FormField
          label="Record name"
          description={`Leave blank to create a record at the root of ${zoneLabel}.`}
          constraintText="A wildcard (*) is allowed only as the leftmost label."
          errorText={errors.name}
        >
          <div className={styles.nameRow}>
            <div className={styles.nameInput}>
              <Input
                value={draft.name}
                placeholder="subdomain"
                disabled={locked}
                ariaLabel="Record name"
                data-testid={`record-name-${index}`}
                onChange={({ detail }) => onChange({ name: detail.value })}
              />
            </div>
            <Box color="text-body-secondary">.{zoneLabel}</Box>
          </div>
        </FormField>

        <FormField label="Record type" description={meta.helper} errorText={errors.type}>
          <Select
            data-testid={`record-type-${index}`}
            disabled={locked}
            selectedOption={selected(draft.type, draft.type)}
            options={typeChoices.map((type) => selected(type, type))}
            onChange={({ detail }) => {
              const type = (detail.selectedOption.value ?? draft.type) as RecordType;
              onChange({
                type,
                isAlias: (ALIAS_TYPES as readonly string[]).includes(type) ? draft.isAlias : false,
              });
            }}
          />
        </FormField>

        {aliasAllowed && !locked ? (
          <FormField
            label="Alias"
            constraintText="Alias records have no TTL and no value."
            errorText={errors.is_alias}
          >
            <Toggle
              checked={draft.isAlias}
              data-testid={`record-alias-${index}`}
              onChange={({ detail }) => onChange({ isAlias: detail.checked })}
            >
              Alias
            </Toggle>
          </FormField>
        ) : null}

        {showAlias ? (
          <SpaceBetween size="l">
            <FormField label="Route traffic to" errorText={errors.alias_target}>
              <Select
                data-testid={`record-alias-target-${index}`}
                placeholder="Choose an endpoint"
                selectedOption={aliasOption}
                options={aliasOptions}
                onChange={({ detail }) =>
                  onChange({ aliasTarget: detail.selectedOption.value ?? "" })
                }
              />
            </FormField>
            <FormField label="Evaluate target health">
              <Toggle
                checked={draft.evaluateTargetHealth}
                data-testid={`record-evaluate-health-${index}`}
                onChange={({ detail }) => onChange({ evaluateTargetHealth: detail.checked })}
              >
                Evaluate target health
              </Toggle>
            </FormField>
          </SpaceBetween>
        ) : (
          <SpaceBetween size="l">
            <FormField
              label="Value"
              description={`Example: ${meta.example}`}
              constraintText="Enter one value per line."
              errorText={errors.values}
            >
              <Textarea
                value={draft.valuesText}
                placeholder={meta.placeholder}
                rows={4}
                data-testid={`record-values-${index}`}
                onChange={({ detail }) => onChange({ valuesText: detail.value })}
              />
            </FormField>
            <FormField
              label="TTL (seconds)"
              description="How long resolvers cache this record. The default is 300 seconds."
              constraintText="Integer from 0 to 2147483647."
              errorText={errors.ttl}
            >
              <SpaceBetween size="xs">
                <SegmentedControl
                  data-testid={`record-ttl-presets-${index}`}
                  label="TTL presets"
                  selectedId={presetId}
                  options={TTL_PRESETS.map((preset) => ({ id: preset.id, text: preset.label }))}
                  onChange={({ detail }) => onChange({ ttl: detail.selectedId })}
                />
                <Input
                  type="number"
                  value={draft.ttl}
                  inputMode="numeric"
                  data-testid={`record-ttl-${index}`}
                  onChange={({ detail }) => onChange({ ttl: detail.value })}
                />
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        )}

        <FormField
          label="Routing policy"
          description={ROUTING_HELPER[draft.routingPolicy]}
          errorText={errors.routing_policy}
        >
          <Select
            data-testid={`record-routing-${index}`}
            disabled={locked}
            selectedOption={selected(draft.routingPolicy, draft.routingPolicy)}
            options={(
              ["Simple", "Weighted", "Latency", "Failover", "Geolocation", "Multivalue"] as const
            ).map((policy) => selected(policy, policy))}
            onChange={({ detail }) =>
              onChange({
                routingPolicy: (detail.selectedOption.value ?? "Simple") as RoutingPolicy,
              })
            }
          />
        </FormField>

        {!locked && draft.routingPolicy === "Latency" ? (
          <FormField label="Region" description="Stored with the record ID.">
            <Select
              data-testid={`record-region-${index}`}
              placeholder="Choose a region"
              selectedOption={
                LATENCY_REGIONS.find((region) => region.value === draft.region) ?? null
              }
              options={LATENCY_REGIONS.map((region) => ({
                value: region.value,
                label: region.label,
                description: region.value,
              }))}
              onChange={({ detail }) => onChange({ region: detail.selectedOption.value ?? "" })}
            />
          </FormField>
        ) : null}

        {!locked && draft.routingPolicy === "Failover" ? (
          <FormField label="Failover record type">
            <Select
              data-testid={`record-failover-${index}`}
              placeholder="Choose Primary or Secondary"
              selectedOption={
                FAILOVER_OPTIONS.find((option) => option.value === draft.failover) ?? null
              }
              options={FAILOVER_OPTIONS.map((option) => ({ ...option }))}
              onChange={({ detail }) => onChange({ failover: detail.selectedOption.value ?? "" })}
            />
          </FormField>
        ) : null}

        {!locked && draft.routingPolicy === "Geolocation" ? (
          <FormField label="Location">
            <Select
              data-testid={`record-location-${index}`}
              placeholder="Choose a location"
              selectedOption={
                GEO_LOCATIONS.find((option) => option.value === draft.location) ?? null
              }
              options={GEO_LOCATIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={({ detail }) => onChange({ location: detail.selectedOption.value ?? "" })}
            />
          </FormField>
        ) : null}

        {!locked && draft.routingPolicy !== "Simple" ? (
          <FormField
            label="Record ID"
            description="A unique set identifier for this routing policy."
            errorText={errors.set_identifier}
          >
            <Input
              value={draft.setIdentifier}
              placeholder="api-blue"
              data-testid={`record-set-id-${index}`}
              onChange={({ detail }) => onChange({ setIdentifier: detail.value })}
            />
          </FormField>
        ) : null}

        {!locked && draft.routingPolicy === "Weighted" ? (
          <FormField
            label="Weight"
            description="0 to 255. A higher weight receives more traffic."
            errorText={errors.weight}
          >
            <Input
              type="number"
              value={draft.weight}
              inputMode="numeric"
              placeholder="100"
              data-testid={`record-weight-${index}`}
              onChange={({ detail }) => onChange({ weight: detail.value })}
            />
          </FormField>
        ) : null}

        {!locked ? (
          <FormField label="Health check ID - optional" errorText={errors.health_check_id}>
            <Input
              value={draft.healthCheckId}
              placeholder="Health check ID"
              data-testid={`record-health-${index}`}
              onChange={({ detail }) => onChange({ healthCheckId: detail.value })}
            />
          </FormField>
        ) : null}

        <FormField label="Comment - optional" errorText={errors.comment}>
          <Textarea
            value={draft.comment}
            rows={2}
            data-testid={`record-comment-${index}`}
            onChange={({ detail }) => onChange({ comment: detail.value })}
          />
        </FormField>
      </SpaceBetween>
    </Container>
  );
}
