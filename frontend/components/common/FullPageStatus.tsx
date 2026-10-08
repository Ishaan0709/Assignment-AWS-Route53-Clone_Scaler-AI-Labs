"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Spinner from "@cloudscape-design/components/spinner";
import styles from "./FullPageStatus.module.css";

interface LoadingProps {
  text?: string;
}

/** Centered spinner used while restoring the session or redirecting. */
export function FullPageSpinner({ text = "Loading the AWS Management Console…" }: LoadingProps) {
  return (
    <div className={styles.root} role="status" aria-live="polite" data-testid="full-page-spinner">
      <Spinner size="large" />
      <Box variant="p" color="text-body-secondary">
        {text}
      </Box>
    </div>
  );
}

interface ErrorProps {
  message: string;
  onRetry: () => void;
}

export function FullPageError({ message, onRetry }: ErrorProps) {
  return (
    <div className={styles.root}>
      <Alert
        type="error"
        header="The console could not load your session"
        action={<Button onClick={onRetry}>Retry</Button>}
      >
        {message}
      </Alert>
    </div>
  );
}
