"use client";

import { applyMode, Mode } from "@cloudscape-design/global-styles";
import type { ReactNode } from "react";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { ThemeMode } from "@/lib/theme";
import { persistTheme, readStoredTheme, resolveInitialTheme, systemTheme } from "@/lib/theme";

export interface ThemeApi {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with "light" on the server; the boot script already painted the right
  // body class, and the effect below syncs React state on mount.
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    setModeState(resolveInitialTheme());
  }, []);

  useEffect(() => {
    applyMode(mode === "dark" ? Mode.Dark : Mode.Light);
  }, [mode]);

  // Follow the OS preference while the user has not chosen explicitly.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredTheme() === null) setModeState(systemTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    persistTheme(next);
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo<ThemeApi>(
    () => ({ mode, isDark: mode === "dark", setMode, toggle }),
    [mode, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
