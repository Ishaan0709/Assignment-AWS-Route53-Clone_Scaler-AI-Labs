"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * `useState` mirrored to localStorage. Starts with `initial` on the server and
 * on first render, then adopts the stored value after mount (avoids hydration
 * mismatches). `validate` guards against stale or malformed stored shapes.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  validate: (value: unknown) => value is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (validate(parsed)) setValue(parsed);
      }
    } catch {
      // Ignore unreadable storage; fall back to the default.
    }
    hydrated.current = true;
    // `validate` is expected to be stable; the key identifies the stored slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); in-memory state still works.
      }
    },
    [key],
  );

  return [value, update];
}
