"use client";

import AppLayout from "@cloudscape-design/components/app-layout";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Notifications } from "@/components/common/Notifications";
import { BottomBar } from "@/components/layout/BottomBar";
import { SideNav } from "@/components/layout/SideNav";
import { TopBar } from "@/components/layout/TopBar";
import { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { configureApi, resetApiConfig } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import type { User } from "@/types/api";

interface ConsoleShellProps {
  user: User;
  children: ReactNode;
}

/** Top bar + AppLayout (side navigation, flashbar, content) + bottom strip. */
export function ConsoleShell({ user, children }: ConsoleShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const notify = useNotifications();

  // Expired sessions: drop the cached user, explain, and go to the login page
  // with a client-side navigation instead of a full reload.
  useEffect(() => {
    configureApi({
      onUnauthorized: (currentPath) => {
        queryClient.setQueryData(AUTH_QUERY_KEY, null);
        notify.warning("Session expired", "Sign in again to continue.", { id: "session-expired" });
        router.replace(`${ROUTES.login}?next=${encodeURIComponent(currentPath)}`);
      },
    });
    return () => resetApiConfig();
  }, [notify, queryClient, router]);

  return (
    <>
      <TopBar user={user} />
      <AppLayout
        headerSelector="#top-nav"
        footerSelector="#bottom-bar"
        navigation={<SideNav />}
        navigationOpen={navigationOpen}
        onNavigationChange={(event) => setNavigationOpen(event.detail.open)}
        notifications={<Notifications />}
        toolsHide
        content={<div key={pathname}>{children}</div>}
        ariaLabels={{
          navigation: "Route 53 navigation",
          navigationToggle: "Open navigation",
          navigationClose: "Close navigation",
          notifications: "Notifications",
        }}
      />
      <BottomBar />
    </>
  );
}
