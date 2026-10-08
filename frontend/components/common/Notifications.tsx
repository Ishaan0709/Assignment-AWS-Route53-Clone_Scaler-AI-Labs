"use client";

import Flashbar from "@cloudscape-design/components/flashbar";
import { useNotifications } from "@/hooks/useNotifications";

/** Renders the global notification stack; place in AppLayout's `notifications` slot. */
export function Notifications() {
  const { flashItems } = useNotifications();
  return (
    <Flashbar
      items={flashItems}
      stackItems={flashItems.length > 2}
      i18nStrings={{
        ariaLabel: "Notifications",
        notificationBarAriaLabel: "View all notifications",
        notificationBarText: "Notifications",
        errorIconAriaLabel: "Error",
        warningIconAriaLabel: "Warning",
        successIconAriaLabel: "Success",
        infoIconAriaLabel: "Info",
        inProgressIconAriaLabel: "In progress",
      }}
    />
  );
}
