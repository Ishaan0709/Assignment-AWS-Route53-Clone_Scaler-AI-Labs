"use client";

import Icon from "@cloudscape-design/components/icon";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AwsLogo } from "@/components/layout/AwsLogo";
import type { HeaderMenuItem } from "@/components/layout/HeaderMenu";
import { HeaderMenu } from "@/components/layout/HeaderMenu";
import { useLogout } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { DOCS_URL, ROUTES, SERVICE_SHORTCUTS, formatAccountId } from "@/lib/constants";
import type { User } from "@/types/api";
import styles from "./TopBar.module.css";

interface TopBarProps {
  user: User;
}

/** Sticky dark console header (`#top-nav`), modelled on the AWS Management Console. */
export function TopBar({ user }: TopBarProps) {
  const { mode, setMode } = useTheme();
  const { logout, isPending } = useLogout();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  // Alt+S focuses the search field, like the real console.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const accountId = formatAccountId(user.account_id);

  const serviceItems: HeaderMenuItem[] = [
    { kind: "label", id: "recent", text: "Recently visited" },
    ...SERVICE_SHORTCUTS.map<HeaderMenuItem>((service) =>
      "href" in service
        ? { id: service.id, text: service.text, href: service.href }
        : {
            id: service.id,
            text: service.text,
            description: "Not available in this clone",
            disabled: true,
          },
    ),
  ];

  const settingsItems: HeaderMenuItem[] = [
    { kind: "label", id: "visual", text: "Visual mode" },
    { id: "light", text: "Light", checked: mode === "light", onSelect: () => setMode("light") },
    { id: "dark", text: "Dark", checked: mode === "dark", onSelect: () => setMode("dark") },
  ];

  const regionItems: HeaderMenuItem[] = [
    { id: "global", text: "Global", description: "Route 53 is a global service", checked: true },
    { kind: "divider", id: "d1" },
    { id: "us-east-1", text: "US East (N. Virginia)", description: "us-east-1", disabled: true },
    { id: "us-west-2", text: "US West (Oregon)", description: "us-west-2", disabled: true },
    { id: "eu-west-1", text: "Europe (Ireland)", description: "eu-west-1", disabled: true },
    { id: "ap-south-1", text: "Asia Pacific (Mumbai)", description: "ap-south-1", disabled: true },
  ];

  const accountItems: HeaderMenuItem[] = [
    { id: "account", text: "Account", description: accountId, disabled: true },
    { id: "org", text: "Organization", disabled: true },
    { id: "billing", text: "Billing and Cost Management", disabled: true },
    { id: "security", text: "Security credentials", disabled: true },
    { kind: "divider", id: "d1" },
    { id: "signout", text: isPending ? "Signing out…" : "Sign out", onSelect: () => void logout() },
  ];

  return (
    <header id="top-nav" className={styles.header} data-testid="top-nav">
      <div className={styles.left}>
        <Link
          href={ROUTES.dashboard}
          className={styles.logo}
          aria-label="AWS Management Console home"
        >
          <AwsLogo height={22} />
        </Link>
        <HeaderMenu
          align="left"
          ariaLabel="Services"
          testId="services-menu"
          label={
            <>
              <Icon name="grid-view" />
              <span className={styles.hideOnMobile}>Services</span>
            </>
          }
          items={serviceItems}
        />
        <form
          className={styles.search}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon name="search" />
          </span>
          <input
            ref={searchRef}
            type="search"
            className={styles.searchInput}
            placeholder="Search"
            aria-label="Search services, features, blogs, docs, and more"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd className={styles.searchHint} aria-hidden="true">
            [Alt+S]
          </kbd>
        </form>
      </div>

      <div className={styles.right}>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.hideOnMobile}`}
          aria-label="CloudShell"
          title="CloudShell"
        >
          <Icon name="command-prompt" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Notifications"
          title="Notifications"
        >
          <Icon name="notification" />
        </button>
        <a
          className={`${styles.iconButton} ${styles.hideOnMobile}`}
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Help"
          title="Help"
        >
          <Icon name="status-info" />
        </a>
        <HeaderMenu
          ariaLabel="Settings"
          testId="settings-menu"
          showCaret={false}
          label={<Icon name="settings" />}
          items={settingsItems}
        />
        <HeaderMenu
          ariaLabel="Select a region"
          testId="region-menu"
          label={<span>Global</span>}
          items={regionItems}
          header={
            <div className={styles.menuHeader}>
              <strong>Global</strong>
              <span>Route 53 resources are not tied to a region.</span>
            </div>
          }
        />
        <HeaderMenu
          ariaLabel="Account menu"
          testId="account-menu"
          label={
            <>
              <span className={styles.accountIcon} aria-hidden="true">
                <Icon name="user-profile" />
              </span>
              <span className={styles.hideOnMobile} data-testid="account-label">
                {user.username} @ {accountId}
              </span>
            </>
          }
          items={accountItems}
          header={
            <div className={styles.menuHeader}>
              <strong>{user.display_name}</strong>
              <span>Account ID: {accountId}</span>
              <span>IAM user: {user.username}</span>
            </div>
          }
        />
      </div>
    </header>
  );
}
