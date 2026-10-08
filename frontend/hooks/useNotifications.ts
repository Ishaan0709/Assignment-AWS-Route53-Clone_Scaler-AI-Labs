"use client";

import { useContext } from "react";
import type { NotificationApi } from "@/components/common/NotificationProvider";
import { NotificationContext } from "@/components/common/NotificationProvider";

/**
 * Flashbar notifications: `notify.success(title, content)`, `notify.error(...)`,
 * `notify.info(...)`. Items are dismissible, stackable and auto-dismiss after ~8 s.
 */
export function useNotifications(): NotificationApi {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
