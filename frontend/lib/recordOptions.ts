import { AWS_REGIONS } from "@/lib/constants";
import type { RecordType } from "@/types/api";

export interface RecordTypeMeta {
  helper: string;
  placeholder: string;
  example: string;
}

/** Helper text, placeholder and example shown on the record form. Updates with the type. */
export const RECORD_TYPE_META: Record<RecordType, RecordTypeMeta> = {
  A: {
    helper: "Routes traffic to an IPv4 address. Enter one address per line.",
    placeholder: "192.0.2.1",
    example: "192.0.2.1",
  },
  AAAA: {
    helper: "Routes traffic to an IPv6 address. Enter one address per line.",
    placeholder: "2001:db8::1",
    example: "2001:db8::1",
  },
  CNAME: {
    helper:
      "Routes traffic to another domain name. A CNAME cannot be created at the zone apex and cannot share its name with any other record.",
    placeholder: "target.example.com",
    example: "target.example.com.",
  },
  TXT: {
    helper:
      "Text record. Wrap each string in double quotes (255 characters max). Unquoted text is quoted for you, split into 255-character chunks.",
    placeholder: '"v=spf1 include:_spf.example.com ~all"',
    example: '"v=spf1 -all"',
  },
  MX: {
    helper: "Mail exchange. Each line is a priority (0–65535) and a mail server.",
    placeholder: "10 mail.example.com",
    example: "10 mail.example.com.",
  },
  NS: {
    helper:
      "Name servers for a subdomain. Enter one hostname per line. The apex NS record is created with the zone.",
    placeholder: "ns1.example.com",
    example: "ns1.example.com.",
  },
  PTR: {
    helper: "Pointer to a canonical hostname. Enter exactly one hostname.",
    placeholder: "host.example.com",
    example: "host.example.com.",
  },
  SRV: {
    helper: "Service location. Each line is priority, weight, port and target.",
    placeholder: "10 5 5060 sip.example.com",
    example: "10 5 5060 sip.example.com.",
  },
  CAA: {
    helper:
      "Certification authority authorization. Each line is flags (0–255), a tag (issue, issuewild or iodef) and a quoted value.",
    placeholder: '0 issue "letsencrypt.org"',
    example: '0 issue "letsencrypt.org"',
  },
  SOA: {
    helper:
      "Start of authority. Created automatically with the hosted zone. You can edit the TTL and the value; you cannot create another SOA.",
    placeholder: "ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400",
    example: "ns-1.awsdns-01.org. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400",
  },
};

export const TTL_PRESETS = [
  { id: "60", label: "1m", seconds: 60 },
  { id: "300", label: "5m", seconds: 300 },
  { id: "3600", label: "1h", seconds: 3600 },
  { id: "86400", label: "1d", seconds: 86400 },
] as const;

export interface AliasEndpoint {
  label: string;
  description: string;
  value: string;
}

/** Mocked "Route traffic to" targets. The zone apex is appended by the form. */
export const ALIAS_ENDPOINTS: readonly AliasEndpoint[] = [
  {
    label: "CloudFront distribution",
    description: "d111111abcdef8.cloudfront.net",
    value: "d111111abcdef8.cloudfront.net.",
  },
  {
    label: "Application Load Balancer",
    description: "dualstack.my-lb-1234567890.us-east-1.elb.amazonaws.com",
    value: "dualstack.my-lb-1234567890.us-east-1.elb.amazonaws.com.",
  },
  {
    label: "S3 website endpoint",
    description: "s3-website-us-east-1.amazonaws.com",
    value: "s3-website-us-east-1.amazonaws.com.",
  },
  {
    label: "API Gateway API",
    description: "d-abc123.execute-api.us-east-1.amazonaws.com",
    value: "d-abc123.execute-api.us-east-1.amazonaws.com.",
  },
];

export const FAILOVER_OPTIONS = [
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
] as const;

export const GEO_LOCATIONS = [
  { value: "NA", label: "North America" },
  { value: "EU", label: "Europe" },
  { value: "AS", label: "Asia" },
  { value: "AF", label: "Africa" },
  { value: "OC", label: "Oceania" },
  { value: "SA", label: "South America" },
  { value: "US", label: "United States" },
  { value: "IN", label: "India" },
  { value: "DE", label: "Germany" },
  { value: "GB", label: "United Kingdom" },
  { value: "JP", label: "Japan" },
  { value: "default", label: "Default" },
] as const;

export const LATENCY_REGIONS = AWS_REGIONS;

export const ROUTING_HELPER: Record<string, string> = {
  Simple: "Standard DNS response. Route 53 returns the values for this record.",
  Weighted:
    "Send a share of traffic to each record. A record ID and a weight from 0 to 255 are required.",
  Latency: "Route users to the region with the lowest latency. Choose a region and a record ID.",
  Failover: "Active-passive failover. Choose Primary or Secondary and a record ID.",
  Geolocation: "Route based on the location of the user. Choose a location and a record ID.",
  Multivalue: "Return multiple healthy values. A record ID is required for each answer.",
};
