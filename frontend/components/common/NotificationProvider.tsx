"use client";

import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import type { ReactNode } from "react";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NOTIFICATION_TTL_MS } from "@/lib/constants";

export type NotificationType = "success" | "error" | "info" | "warning" | "in-progress";

export interface Notification {
  id: string;
  type: NotificationType;
  header: ReactNode;
  content?: ReactNode;
  /** Milliseconds until auto-dismiss; `null` keeps it until dismissed by the user. */
  ttl: number | null;
}

export interface NotifyOptions {
  /** Override the default auto-dismiss delay; `null` disables auto-dismiss. */
  ttl?: number | null;
  /** Re-use an id to replace an existing notification in place. */
  id?: string;
}

export interface NotificationApi {
  items: Notification[];
  /** Cloudscape-ready items for `<Flashbar items={...} />`. */
  flashItems: FlashbarProps.MessageDefinition[];
  add: (
    type: NotificationType,
    header: ReactNode,
    content?: ReactNode,
    options?: NotifyOptions,
  ) => string;
  success: (header: ReactNode, content?: ReactNode, options?: NotifyOptions) => string;
  error: (header: ReactNode, content?: ReactNode, options?: NotifyOptions) => string;
  info: (header: ReactNode, content?: ReactNode, options?: NotifyOptions) => string;
  warning: (header: ReactNode, content?: ReactNode, options?: NotifyOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const NotificationContext = createContext<NotificationApi | null>(null);

let counter = 0;
function nextId(): string {
  counter += 1;
  return `n-${Date.now().toString(36)}-${counter}`;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const add = useCallback<NotificationApi["add"]>(
    (type, header, content, options = {}) => {
      const id = options.id ?? nextId();
      const ttl = options.ttl === undefined ? NOTIFICATION_TTL_MS : options.ttl;
      const notification: Notification = { id, type, header, content, ttl };

      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      if (ttl !== null && type !== "in-progress") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ttl),
        );
      }

      setItems((current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index === -1) return [notification, ...current];
        return current.map((item, i) => (i === index ? notification : item));
      });
      return id;
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<NotificationApi>(() => {
    const flashItems: FlashbarProps.MessageDefinition[] = items.map((item) => ({
      id: item.id,
      type: item.type,
      header: item.header,
      content: item.content,
      dismissible: true,
      dismissLabel: "Dismiss notification",
      onDismiss: () => dismiss(item.id),
      loading: item.type === "in-progress",
      statusIconAriaLabel: item.type,
    }));
    return {
      items,
      flashItems,
      add,
      success: (header, content, options) => add("success", header, content, options),
      error: (header, content, options) => add("error", header, content, options),
      info: (header, content, options) => add("info", header, content, options),
      warning: (header, content, options) => add("warning", header, content, options),
      dismiss,
      clear,
    };
  }, [items, add, dismiss, clear]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
