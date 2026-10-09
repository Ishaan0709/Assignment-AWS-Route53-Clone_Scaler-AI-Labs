"use client";

import type { LinkProps } from "@cloudscape-design/components/link";
import Link from "@cloudscape-design/components/link";
import { useRouter } from "next/navigation";

/** Cloudscape `Link` that navigates with the Next.js router instead of a full reload. */
export function RouterLink({ href, onFollow, ...rest }: LinkProps) {
  const router = useRouter();
  return (
    <Link
      {...rest}
      href={href}
      onFollow={(event) => {
        onFollow?.(event);
        if (event.defaultPrevented || !href || rest.external) return;
        event.preventDefault();
        router.push(href);
      }}
    />
  );
}
