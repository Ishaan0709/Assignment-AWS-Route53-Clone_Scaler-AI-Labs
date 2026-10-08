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
} as const;

/** Flashbar auto-dismiss delay in milliseconds. */
export const NOTIFICATION_TTL_MS = 8_000;

/** Formats `123456789012` as `1234-5678-9012`, like the AWS account menu. */
export function formatAccountId(accountId: string): string {
  const digits = accountId.replace(/\D/g, "");
  if (digits.length !== 12) return accountId;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}
