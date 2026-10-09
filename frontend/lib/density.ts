import { STORAGE_KEYS } from "@/lib/constants";

export type DensityMode = "comfortable" | "compact";

export function isDensityMode(value: unknown): value is DensityMode {
  return value === "comfortable" || value === "compact";
}

/** Comfortable unless the user has chosen compact. */
export function readStoredDensity(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.density);
    return isDensityMode(stored) ? stored : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function persistDensity(density: DensityMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.density, density);
  } catch {
    // Storage may be unavailable; the in-memory choice still applies.
  }
}
