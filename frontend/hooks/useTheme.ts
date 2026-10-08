"use client";

import { useContext } from "react";
import type { ThemeApi } from "@/components/common/ThemeProvider";
import { ThemeContext } from "@/components/common/ThemeProvider";

/** Light/dark mode, persisted in localStorage and seeded from `prefers-color-scheme`. */
export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
