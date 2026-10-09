import { ROUTES } from "@/lib/constants";

export type ShortcutAction =
  | { type: "focus-filter" }
  | { type: "create"; href: string }
  | { type: "navigate"; href: string }
  | { type: "help" }
  | { type: "close" };

export interface ShortcutInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  typing: boolean;
  modalOpen: boolean;
  helpOpen: boolean;
  path: string;
  pendingG: boolean;
}

export interface ShortcutDecision {
  action: ShortcutAction | null;
  pendingG: boolean;
}

/** Create-zone on the list, create-record on a zone detail page. */
export function createHref(path: string): string | null {
  const match = /^\/hostedzones\/([^/]+)$/.exec(path);
  if (match?.[1] && match[1] !== "create") return ROUTES.createRecord(match[1]);
  if (path === ROUTES.hostedZones) return ROUTES.createHostedZone;
  return null;
}

/**
 * Keyboard map: `/` filter, `c` create, `g` then `h` hosted zones, `?` help.
 * Ignored while typing or while a dialog is open. Escape closes the help dialog only.
 */
export function decideShortcut(input: ShortcutInput): ShortcutDecision {
  if (input.key === "Escape") {
    return { action: input.helpOpen ? { type: "close" } : null, pendingG: false };
  }
  if (input.metaKey || input.ctrlKey || input.altKey || input.typing || input.modalOpen) {
    return { action: null, pendingG: false };
  }
  if (input.key === "?") return { action: { type: "help" }, pendingG: false };
  if (input.key === "/") return { action: { type: "focus-filter" }, pendingG: false };
  if (input.key === "c" || input.key === "C") {
    const href = createHref(input.path);
    return { action: href ? { type: "create", href } : null, pendingG: false };
  }
  if (input.key === "g") return { action: null, pendingG: true };
  if (input.pendingG && (input.key === "h" || input.key === "H")) {
    return { action: { type: "navigate", href: ROUTES.hostedZones }, pendingG: false };
  }
  return { action: null, pendingG: false };
}
