"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { createQueryClient } from "@/lib/queryClient";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session; created lazily so SSR never shares state.
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
