"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { FullPageError, FullPageSpinner } from "@/components/common/FullPageStatus";
import { ConsoleShell } from "@/components/layout/ConsoleShell";
import { useAuth } from "@/hooks/useAuth";
import { ROUTES } from "@/lib/constants";

/** Route guard for everything inside the console: spinner while loading, redirect when signed out. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (auth.status === "authenticated") wasAuthenticated.current = true;
    // Arriving signed out: send to login and come back here afterwards. Losing the
    // session while mounted (sign-out, expiry) is handled by whoever cleared it.
    if (auth.status === "unauthenticated" && !wasAuthenticated.current) {
      router.replace(`${ROUTES.login}?next=${encodeURIComponent(pathname)}`);
    }
  }, [auth.status, pathname, router]);

  if (auth.status === "error") {
    return (
      <FullPageError message={auth.error?.message ?? "Unknown error"} onRetry={auth.refetch} />
    );
  }
  if (auth.status !== "authenticated" || !auth.user) {
    return <FullPageSpinner />;
  }
  return <ConsoleShell user={auth.user}>{children}</ConsoleShell>;
}
