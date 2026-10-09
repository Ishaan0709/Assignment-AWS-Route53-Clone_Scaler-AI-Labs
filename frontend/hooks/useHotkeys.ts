"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { decideShortcut } from "@/lib/shortcuts";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/** Global console shortcuts. Returns whether the help dialog is open. */
export function useHotkeys(): { helpOpen: boolean; closeHelp: () => void } {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(false);
  const helpOpenRef = useRef(helpOpen);
  helpOpenRef.current = helpOpen;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const decision = decideShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        typing: isTypingTarget(event.target),
        modalOpen: document.querySelector('[role="dialog"]') !== null,
        helpOpen: helpOpenRef.current,
        path: pathname,
        pendingG: pendingG.current,
      });
      pendingG.current = decision.pendingG;
      if (!decision.action) return;
      event.preventDefault();
      switch (decision.action.type) {
        case "focus-filter":
          document.querySelector<HTMLInputElement>("[data-hotkey-filter] input")?.focus();
          break;
        case "create":
        case "navigate":
          router.push(decision.action.href);
          break;
        case "help":
          setHelpOpen(true);
          break;
        case "close":
          setHelpOpen(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return { helpOpen, closeHelp: () => setHelpOpen(false) };
}
