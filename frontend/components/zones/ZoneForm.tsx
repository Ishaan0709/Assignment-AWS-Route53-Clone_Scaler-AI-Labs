"use client";

import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { useMemo, useState } from "react";
import { TagEditor } from "@/components/zones/TagEditor";
import { isApiError } from "@/lib/api";
import { AWS_REGIONS, vpcsForRegion } from "@/lib/constants";
import {
  hasErrors,
  hasTagErrors,
  normalizeDomainInput,
  tagErrors,
  tagsToApi,
  validateZoneForm,
  type TagRow,
  type ZoneFormErrors,
  type ZoneFormValues,
} from "@/lib/validators";
import type { HostedZoneCreate } from "@/types/api";
import { MAX_ZONE_DESCRIPTION } from "@/types/api";

interface ZoneFormProps {
  onSubmit: (payload: HostedZoneCreate) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const INITIAL: ZoneFormValues = {
  name: "",
  description: "",
  type: "public",
  vpcRegion: "",
  vpcId: "",
  tags: [],
};

/** Maps backend `fields` keys onto the form's field names. */
function mapServerFields(fields: Record<string, string>): ZoneFormErrors & { tags?: string } {
  const mapped: ZoneFormErrors & { tags?: string } = {};
  if (fields.name) mapped.name = fields.name;
  if (fields.description) mapped.description = fields.description;
  if (fields.vpc_region) mapped.vpcRegion = fields.vpc_region;
  if (fields.vpc_id) mapped.vpcId = fields.vpc_id;
  if (fields.tags) mapped.tags = fields.tags;
  return mapped;
}

/** Full-page "Create hosted zone" form, modelled on the Route 53 console. */
export function ZoneForm({ onSubmit, onCancel, submitting }: ZoneFormProps) {
  const [values, setValues] = useState<ZoneFormValues>(INITIAL);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<ZoneFormErrors & { tags?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const clientErrors = useMemo(() => (touched ? validateZoneForm(values) : {}), [touched, values]);
  const errors: ZoneFormErrors = { ...serverErrors, ...clientErrors };
  const rowErrors = touched ? tagErrors(values.tags) : values.tags.map(() => ({}));

  const update = <K extends keyof ZoneFormValues>(key: K, value: ZoneFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as keyof typeof next];
      return next;
    });
    setFormError(null);
  };

  const regionOptions = AWS_REGIONS.map((region) => ({
    value: region.value,
    label: region.label,
    description: region.value,
  }));
  const vpcOptions = values.vpcRegion
    ? vpcsForRegion(values.vpcRegion).map((vpc) => ({
        value: vpc.id,
        label: vpc.id,
        description: vpc.name,
      }))
    : [];

  const submit = async () => {
    setTouched(true);
    setFormError(null);
    const validation = validateZoneForm(values);
    if (hasErrors(validation) || hasTagErrors(tagErrors(values.tags))) return;

    const payload: HostedZoneCreate = {
      name: normalizeDomainInput(values.name),
      type: values.type,
      description: values.description.trim() || null,
      vpc_id: values.type === "private" ? values.vpcId.trim() : null,
      vpc_region: values.type === "private" ? values.vpcRegion : null,
      tags: tagsToApi(values.tags),
    };
    try {
      await onSubmit(payload);
    } catch (error) {
      if (isApiError(error) && Object.keys(error.fields).length > 0) {
        setServerErrors(mapServerFields(error.fields));
      } else {
        setFormError(error instanceof Error ? error.message : "Something went wrong. Try again.");
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
      data-testid="zone-form"
    >
      <Form
        errorText={formError}
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
              data-testid="zone-form-submit"
            >
              Create hosted zone
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
            <SpaceBetween size="l">
              <FormField
                label="Domain name"
                description="This is the name of the domain that you want to route traffic for."
                constraintText="Enter the fully qualified domain name, e.g. example.com"
                errorText={errors.name}
                stretch
              >
                <Input
                  value={values.name}
                  onChange={({ detail }) => update("name", detail.value)}
                  placeholder="example.com"
                  autoComplete="off"
                  spellcheck={false}
                  ariaRequired
                  invalid={Boolean(errors.name)}
                  data-testid="zone-name"
                />
              </FormField>

              <FormField
                label={
                  <span>
                    Description - <i>optional</i>
                  </span>
                }
                description="This value lets you distinguish hosted zones that have the same name."
                constraintText={`The description can have up to ${MAX_ZONE_DESCRIPTION} characters. ${values.description.length}/${MAX_ZONE_DESCRIPTION}`}
                errorText={errors.description}
                stretch
              >
                <Textarea
                  value={values.description}
                  onChange={({ detail }) => update("description", detail.value)}
                  rows={3}
                  ariaLabel="Description"
                  data-testid="zone-description"
                />
              </FormField>

              <FormField
                label="Type"
                description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC."
                stretch
              >
                <RadioGroup
                  value={values.type}
                  onChange={({ detail }) =>
                    update("type", detail.value === "private" ? "private" : "public")
                  }
                  ariaLabel="Hosted zone type"
                  items={[
                    {
                      value: "public",
                      label: "Public hosted zone",
                      description:
                        "A public hosted zone determines how traffic is routed on the internet.",
                    },
                    {
                      value: "private",
                      label: "Private hosted zone",
                      description:
                        "A private hosted zone determines how traffic is routed within an Amazon VPC.",
                    },
                  ]}
                />
              </FormField>
            </SpaceBetween>
          </Container>

          {values.type === "private" && (
            <Container
              header={
                <Header
                  variant="h2"
                  description="Associate the private hosted zone with at least one VPC. DNS queries from the VPC are resolved by this hosted zone."
                >
                  VPCs to associate with the hosted zone
                </Header>
              }
              data-testid="zone-vpc-section"
            >
              <SpaceBetween size="l">
                <FormField label="Region" errorText={errors.vpcRegion} stretch>
                  <Select
                    selectedOption={
                      regionOptions.find((option) => option.value === values.vpcRegion) ?? null
                    }
                    onChange={({ detail }) => {
                      update("vpcRegion", detail.selectedOption.value ?? "");
                      update("vpcId", "");
                    }}
                    options={regionOptions}
                    placeholder="Choose a region"
                    filteringType="auto"
                    ariaLabel="Region"
                    invalid={Boolean(errors.vpcRegion)}
                    data-testid="zone-vpc-region"
                  />
                </FormField>
                <FormField
                  label="VPC ID"
                  description="Choose the VPC that you want to associate with the hosted zone."
                  errorText={errors.vpcId}
                  stretch
                >
                  <Select
                    selectedOption={
                      vpcOptions.find((option) => option.value === values.vpcId) ?? null
                    }
                    onChange={({ detail }) => update("vpcId", detail.selectedOption.value ?? "")}
                    options={vpcOptions}
                    placeholder={values.vpcRegion ? "Choose a VPC" : "Choose a region first"}
                    disabled={!values.vpcRegion}
                    ariaLabel="VPC ID"
                    invalid={Boolean(errors.vpcId)}
                    data-testid="zone-vpc-id"
                  />
                </FormField>
              </SpaceBetween>
            </Container>
          )}

          <Container
            header={
              <Header
                variant="h2"
                description="Apply tags to your hosted zone to help organize and identify them."
              >
                Tags - <i>optional</i>
              </Header>
            }
          >
            <FormField errorText={serverErrors.tags} stretch>
              <TagEditor
                rows={values.tags}
                errors={rowErrors}
                onChange={(rows: TagRow[]) => update("tags", rows)}
                disabled={submitting}
              />
            </FormField>
          </Container>
        </SpaceBetween>
      </Form>
    </form>
  );
}
