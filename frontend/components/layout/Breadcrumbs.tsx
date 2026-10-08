"use client";

import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/constants";

export interface Crumb {
  text: string;
  href?: string;
}

interface BreadcrumbsProps {
  /** Crumbs after the leading "Route 53" entry; the last one is the current page. */
  items: Crumb[];
}

/** `Route 53 > Hosted zones > example.com` with client-side navigation. */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const router = useRouter();
  const all = [{ text: "Route 53", href: ROUTES.dashboard }, ...items];
  return (
    <BreadcrumbGroup
      ariaLabel="Breadcrumbs"
      expandAriaLabel="Show path"
      items={all.map((item) => ({ text: item.text, href: item.href ?? "#" }))}
      onFollow={(event) => {
        event.preventDefault();
        if (event.detail.href && event.detail.href !== "#") router.push(event.detail.href);
      }}
    />
  );
}
