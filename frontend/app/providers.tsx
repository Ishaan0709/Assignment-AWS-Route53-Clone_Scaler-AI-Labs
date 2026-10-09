"use client";

import { I18nProvider } from "@cloudscape-design/components/i18n";
import enMessages from "@cloudscape-design/components/i18n/messages/all.en";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { NotificationProvider } from "@/components/common/NotificationProvider";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { createQueryClient } from "@/lib/queryClient";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session; created lazily so SSR never shares state.
  const [queryClient] = useState(createQueryClient);
  return (
    <I18nProvider locale="en" messages={[enMessages]}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <NotificationProvider>{children}</NotificationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
