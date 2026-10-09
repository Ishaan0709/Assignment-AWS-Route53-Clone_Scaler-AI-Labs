/** Single home for app-wide constants (routes, navigation, demo data). */

export const APP_TITLE = "Route 53 Global View";

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  hostedZones: "/hostedzones",
  createHostedZone: "/hostedzones/create",
  hostedZone: (zoneId: string) => `/hostedzones/${encodeURIComponent(zoneId)}`,
  createRecord: (zoneId: string) => `/hostedzones/${encodeURIComponent(zoneId)}/records/create`,
  editRecord: (zoneId: string, recordId: number) =>
    `/hostedzones/${encodeURIComponent(zoneId)}/records/${recordId}/edit`,
  healthChecks: "/health-checks",
  trafficPolicies: "/traffic-policies",
  policyRecords: "/policy-records",
  resolver: {
    vpcs: "/resolver/vpcs",
    inboundEndpoints: "/resolver/inbound-endpoints",
    outboundEndpoints: "/resolver/outbound-endpoints",
    rules: "/resolver/rules",
    queryLogging: "/resolver/query-logging",
  },
  profiles: "/profiles",
  domains: {
    registered: "/domains/registered",
    requests: "/domains/requests",
  },
} as const;

/** Sub-pages served by the Resolver and Domains catch-all routes. */
export const RESOLVER_PAGES: Record<string, string> = {
  vpcs: "VPCs",
  "inbound-endpoints": "Inbound endpoints",
  "outbound-endpoints": "Outbound endpoints",
  rules: "Rules",
  "query-logging": "Query logging",
};

export const DOMAIN_PAGES: Record<string, string> = {
  registered: "Registered domains",
  requests: "Requests",
};

/** Default landing page after sign-in. */
export const HOME_AFTER_LOGIN = ROUTES.hostedZones;

export const DOCS_URL = "https://docs.aws.amazon.com/route53/";

export const DEMO_CREDENTIALS = {
  accountId: "123456789012",
  username: "admin",
  password: "admin123",
} as const;

/** Mocked "Services" menu entries shown in the top bar. */
export const SERVICE_SHORTCUTS = [
  { id: "route53", text: "Route 53", href: ROUTES.dashboard },
  { id: "ec2", text: "EC2", disabled: true },
  { id: "s3", text: "S3", disabled: true },
  { id: "cloudfront", text: "CloudFront", disabled: true },
  { id: "iam", text: "IAM", disabled: true },
] as const;

export const STORAGE_KEYS = {
  theme: "r53.theme",
  density: "r53.density",
  rememberedAccount: "r53.rememberedAccount",
  zonesPreferences: "r53.zones.preferences",
} as const;

/** Regions offered when associating a VPC with a private hosted zone (mocked). */
export const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
] as const;

/** Mocked VPCs per region for the private hosted zone form. */
export const MOCK_VPCS: Record<string, { id: string; name: string }[]> = {
  "us-east-1": [
    { id: "vpc-0a1b2c3d4e5f67890", name: "prod-vpc" },
    { id: "vpc-0f9e8d7c6b5a43210", name: "default" },
  ],
  "us-west-2": [{ id: "vpc-0123456789abcdef0", name: "staging-vpc" }],
  "eu-west-1": [{ id: "vpc-0fedcba9876543210", name: "eu-prod-vpc" }],
  "ap-south-1": [{ id: "vpc-0abcdef1234567890", name: "india-vpc" }],
};

export const DEFAULT_MOCK_VPC = { id: "vpc-0000000000000001", name: "default" };

/** VPC options for a region; every region gets at least the default VPC. */
export function vpcsForRegion(region: string): { id: string; name: string }[] {
  return MOCK_VPCS[region] ?? [DEFAULT_MOCK_VPC];
}

/** Flashbar auto-dismiss delay in milliseconds. */
export const NOTIFICATION_TTL_MS = 8_000;

/** Formats `123456789012` as `1234-5678-9012`, like the AWS account menu. */
export function formatAccountId(accountId: string): string {
  const digits = accountId.replace(/\D/g, "");
  if (digits.length !== 12) return accountId;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}
