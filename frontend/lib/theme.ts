import { STORAGE_KEYS } from "@/lib/constants";

export type ThemeMode = "light" | "dark";

/** Class Cloudscape's `applyMode(Mode.Dark)` adds to the body. */
export const DARK_MODE_CLASS = "awsui-dark-mode";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function readStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.theme);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function systemTheme(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Stored preference first, then the OS preference. */
export function resolveInitialTheme(): ThemeMode {
  return readStoredTheme() ?? systemTheme();
}

export function persistTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.theme, mode);
  } catch {
    // Storage may be unavailable (private mode); the in-memory state still applies.
  }
}

/**
 * Inline script executed before hydration so the first paint already uses the
 * right mode (no light flash on dark-mode reloads). Mirrors `resolveInitialTheme`.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  STORAGE_KEYS.theme,
)};var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d){document.body.classList.add(${JSON.stringify(
  DARK_MODE_CLASS,
)});}}catch(e){}})();`;
