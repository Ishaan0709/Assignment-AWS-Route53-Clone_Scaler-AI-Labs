import { I18nProvider } from "@cloudscape-design/components/i18n";
import enMessages from "@cloudscape-design/components/i18n/messages/all.en";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RenderOptions } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { NotificationProvider } from "@/components/common/NotificationProvider";
import type { HostedZone } from "@/types/api";

export function makeZone(overrides: Partial<HostedZone> = {}): HostedZone {
  return {
    id: "Z0123456789ABCDEFGHIJ",
    name: "example.com.",
    type: "public",
    description: "Primary marketing site",
    vpc_id: null,
    vpc_region: null,
    created_by: "Route 53",
    created_at: "2026-10-01T10:00:00",
    updated_at: "2026-10-01T10:00:00",
    record_count: 2,
    tags: [],
    name_servers: ["ns-1.awsdns-01.org.", "ns-2.awsdns-02.com."],
    ...overrides,
  };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { queryClient?: QueryClient } = {},
) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider locale="en" messages={[enMessages]}>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
