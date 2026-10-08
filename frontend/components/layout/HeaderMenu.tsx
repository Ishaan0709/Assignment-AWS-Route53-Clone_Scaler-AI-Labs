"use client";

import Icon from "@cloudscape-design/components/icon";
import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./HeaderMenu.module.css";

export type HeaderMenuItem =
  | { kind: "divider"; id: string }
  | { kind: "label"; id: string; text: ReactNode }
  | {
      kind?: "item";
      id: string;
      text: ReactNode;
      description?: ReactNode;
      href?: string;
      external?: boolean;
      disabled?: boolean;
      checked?: boolean;
      onSelect?: () => void;
    };

interface HeaderMenuProps {
  /** Visible trigger content (text and/or icon). */
  label: ReactNode;
  ariaLabel?: string;
  items: HeaderMenuItem[];
  /** Optional block rendered at the top of the panel (e.g. account summary). */
  header?: ReactNode;
  align?: "left" | "right";
  showCaret?: boolean;
  /** Extra class for the trigger button. */
  triggerClassName?: string;
  testId?: string;
}

/**
 * Lightweight, accessible dropdown used by the dark console header. Cloudscape's
 * ButtonDropdown is styled for light content areas, so the header uses this
 * primitive to match the real AWS top bar.
 */
export function HeaderMenu({
  label,
  ariaLabel,
  items,
  header,
  align = "right",
  showCaret = true,
  triggerClassName,
  testId,
}: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) {
      const first = panelRef.current?.querySelector<HTMLElement>(
        "[role='menuitem']:not([aria-disabled='true'])",
      );
      first?.focus();
    }
  }, [open]);

  const focusSibling = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "[role='menuitem']:not([aria-disabled='true'])",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    event.preventDefault();
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = focusable[(index + delta + focusable.length) % focusable.length];
    next?.focus();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={[styles.trigger, triggerClassName].filter(Boolean).join(" ")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.triggerLabel}>{label}</span>
        {showCaret && (
          <span className={styles.caret} aria-hidden="true">
            <Icon name="caret-down-filled" size="small" />
          </span>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          ref={panelRef}
          role="menu"
          className={[styles.panel, align === "left" ? styles.alignLeft : styles.alignRight].join(
            " ",
          )}
          onKeyDown={focusSibling}
        >
          {header && <div className={styles.header}>{header}</div>}
          <ul className={styles.list}>
            {items.map((item) => {
              if (item.kind === "divider") {
                return <li key={item.id} role="separator" className={styles.divider} />;
              }
              if (item.kind === "label") {
                return (
                  <li key={item.id} role="presentation" className={styles.label}>
                    {item.text}
                  </li>
                );
              }
              const content = (
                <>
                  <span className={styles.itemText}>
                    <span>{item.text}</span>
                    {item.description && (
                      <span className={styles.itemDescription}>{item.description}</span>
                    )}
                  </span>
                  {item.checked && (
                    <span className={styles.check} aria-hidden="true">
                      <Icon name="check" size="small" />
                    </span>
                  )}
                  {item.external && (
                    <span className={styles.check} aria-hidden="true">
                      <Icon name="external" size="small" />
                    </span>
                  )}
                </>
              );
              const shared = {
                role: "menuitem" as const,
                className: styles.item,
                "aria-disabled": item.disabled || undefined,
                "aria-checked": item.checked,
                "data-testid": `${testId ?? "menu"}-${item.id}`,
              };
              if (item.href && !item.disabled) {
                return (
                  <li key={item.id} role="none">
                    <Link
                      {...shared}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      onClick={() => close()}
                    >
                      {content}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={item.id} role="none">
                  <button
                    {...shared}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      close(true);
                      item.onSelect?.();
                    }}
                  >
                    {content}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
