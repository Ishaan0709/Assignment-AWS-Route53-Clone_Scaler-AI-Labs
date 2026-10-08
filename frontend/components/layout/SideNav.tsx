"use client";

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import { usePathname, useRouter } from "next/navigation";
import { DOCS_URL, ROUTES } from "@/lib/constants";

/** Route 53 navigation tree, exactly as in the AWS console. */
export const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: ROUTES.dashboard },
  { type: "link", text: "Hosted zones", href: ROUTES.hostedZones },
  { type: "link", text: "Health checks", href: ROUTES.healthChecks },
  {
    type: "section",
    text: "Traffic flow",
    items: [
      { type: "link", text: "Traffic policies", href: ROUTES.trafficPolicies },
      { type: "link", text: "Policy records", href: ROUTES.policyRecords },
    ],
  },
  {
    type: "section",
    text: "Resolver",
    items: [
      { type: "link", text: "VPCs", href: ROUTES.resolver.vpcs },
      { type: "link", text: "Inbound endpoints", href: ROUTES.resolver.inboundEndpoints },
      { type: "link", text: "Outbound endpoints", href: ROUTES.resolver.outboundEndpoints },
      { type: "link", text: "Rules", href: ROUTES.resolver.rules },
      { type: "link", text: "Query logging", href: ROUTES.resolver.queryLogging },
    ],
  },
  { type: "link", text: "Profiles", href: ROUTES.profiles },
  {
    type: "section",
    text: "Domains",
    items: [
      { type: "link", text: "Registered domains", href: ROUTES.domains.registered },
      { type: "link", text: "Requests", href: ROUTES.domains.requests },
    ],
  },
  { type: "divider" },
  { type: "link", text: "Documentation", href: DOCS_URL, external: true },
];

function collectHrefs(items: readonly SideNavigationProps.Item[]): string[] {
  const hrefs: string[] = [];
  for (const item of items) {
    if (item.type === "link" && !item.external) hrefs.push(item.href);
    if ("items" in item && Array.isArray(item.items)) hrefs.push(...collectHrefs(item.items));
  }
  return hrefs;
}

const INTERNAL_HREFS = collectHrefs(NAV_ITEMS);

/** Longest nav href that prefixes the current path, so `/hostedzones/Z…` highlights Hosted zones. */
export function resolveActiveHref(pathname: string): string | undefined {
  let best: string | undefined;
  for (const href of INTERNAL_HREFS) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === undefined || href.length > best.length)) best = href;
  }
  return best;
}

export function SideNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SideNavigation
      header={{ text: "Route 53", href: ROUTES.dashboard }}
      activeHref={resolveActiveHref(pathname)}
      items={NAV_ITEMS}
      onFollow={(event) => {
        if (event.detail.external) return;
        event.preventDefault();
        router.push(event.detail.href);
      }}
    />
  );
}
