"use client";

import Icon from "@cloudscape-design/components/icon";
import styles from "./BottomBar.module.css";

/** Dark CloudShell / Feedback strip pinned to the bottom of the console (`#bottom-bar`). */
export function BottomBar() {
  const year = new Date().getFullYear();
  return (
    <footer id="bottom-bar" className={styles.bar} data-testid="bottom-bar">
      <div className={styles.left}>
        <button type="button" className={styles.action} aria-label="Open CloudShell">
          <Icon name="command-prompt" size="small" />
          <span>CloudShell</span>
        </button>
        <button type="button" className={styles.action}>
          Feedback
        </button>
      </div>
      <div className={styles.right}>
        <span className={styles.copyright}>
          © {year}, Amazon Web Services, Inc. or its affiliates.
        </span>
        <a className={styles.link} href="#" onClick={(event) => event.preventDefault()}>
          Privacy
        </a>
        <a className={styles.link} href="#" onClick={(event) => event.preventDefault()}>
          Terms
        </a>
        <a className={styles.link} href="#" onClick={(event) => event.preventDefault()}>
          Cookie preferences
        </a>
      </div>
    </footer>
  );
}
