"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Notifications } from "@/components/common/Notifications";
import { AwsLogo } from "@/components/layout/AwsLogo";
import { useAuth, useLogin } from "@/hooks/useAuth";
import { isApiError } from "@/lib/api";
import { DEMO_CREDENTIALS, HOME_AFTER_LOGIN, STORAGE_KEYS } from "@/lib/constants";
import type { LoginFormValues } from "@/lib/validators";
import { fieldErrors, loginSchema } from "@/lib/validators";
import styles from "./LoginForm.module.css";

const INVALID_CREDENTIALS =
  "Authentication failed because your account ID, IAM user name, or password is incorrect.";

/** Only allow same-origin relative paths as a post-login destination. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return HOME_AFTER_LOGIN;
  }
  return value;
}

function readRememberedAccount(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.rememberedAccount);
  } catch {
    return null;
  }
}

function writeRememberedAccount(accountId: string | null): void {
  try {
    if (accountId) window.localStorage.setItem(STORAGE_KEYS.rememberedAccount, accountId);
    else window.localStorage.removeItem(STORAGE_KEYS.rememberedAccount);
  } catch {
    // Ignore storage failures; remembering the account is a convenience only.
  }
}

export function LoginForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const auth = useAuth();
  const login = useLogin();

  const [values, setValues] = useState<LoginFormValues>({
    accountId: "",
    username: "",
    password: "",
    remember: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Pre-fill a remembered account ID.
  useEffect(() => {
    const remembered = readRememberedAccount();
    if (remembered) setValues((current) => ({ ...current, accountId: remembered, remember: true }));
  }, []);

  // Already signed in (e.g. navigated back to /login): go straight to the console.
  useEffect(() => {
    if (auth.status === "authenticated" && !login.isSuccess && pathname === "/login") {
      router.replace(next);
    }
  }, [auth.status, login.isSuccess, next, pathname, router]);

  const update = <K extends keyof LoginFormValues>(key: K, value: LoginFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
    setFormError(null);
  };

  const fillDemo = () => {
    setValues((current) => ({
      ...current,
      accountId: DEMO_CREDENTIALS.accountId,
      username: DEMO_CREDENTIALS.username,
      password: DEMO_CREDENTIALS.password,
    }));
    setErrors({});
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (login.isPending) return;
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed));
      return;
    }
    setFormError(null);
    try {
      await login.mutateAsync({
        account_id: parsed.data.accountId,
        username: parsed.data.username,
        password: parsed.data.password,
        remember: parsed.data.remember,
      });
      writeRememberedAccount(parsed.data.remember ? parsed.data.accountId : null);
      router.replace(next);
    } catch (error) {
      if (isApiError(error)) {
        if (error.isUnauthorized) setFormError(INVALID_CREDENTIALS);
        else if (Object.keys(error.fields).length > 0) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.fields).map(([key, message]) => [
                key === "account_id" ? "accountId" : key,
                message,
              ]),
            ),
          );
        } else setFormError(error.message);
      } else {
        setFormError("Something went wrong. Try again.");
      }
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.notifications}>
        <Notifications />
      </div>
      <div className={styles.logo}>
        <AwsLogo height={34} color="currentColor" />
      </div>
      <section className={styles.card} aria-labelledby="signin-title">
        <form onSubmit={onSubmit} noValidate data-testid="login-form">
          <SpaceBetween size="l">
            <div>
              <h1 id="signin-title" className={styles.title}>
                Sign in as IAM user
              </h1>
              <Box variant="p" color="text-body-secondary">
                Use the account ID or alias and the IAM user credentials for this demo.
              </Box>
            </div>

            {formError && (
              <Alert type="error" data-testid="login-error">
                {formError}
              </Alert>
            )}

            <FormField
              label="Account ID (12 digits) or account alias"
              errorText={errors.accountId}
              stretch
            >
              <Input
                value={values.accountId}
                onChange={({ detail }) => update("accountId", detail.value)}
                placeholder="123456789012"
                autoComplete="username"
                inputMode="numeric"
                ariaRequired
                data-testid="account-id"
                invalid={Boolean(errors.accountId)}
              />
            </FormField>

            <FormField label="IAM user name" errorText={errors.username} stretch>
              <Input
                value={values.username}
                onChange={({ detail }) => update("username", detail.value)}
                autoComplete="username"
                ariaRequired
                data-testid="username"
                invalid={Boolean(errors.username)}
              />
            </FormField>

            <FormField label="Password" errorText={errors.password} stretch>
              <Input
                type="password"
                value={values.password}
                onChange={({ detail }) => update("password", detail.value)}
                autoComplete="current-password"
                ariaRequired
                data-testid="password"
                invalid={Boolean(errors.password)}
              />
            </FormField>

            <Checkbox
              checked={values.remember}
              onChange={({ detail }) => update("remember", detail.checked)}
              data-testid="remember"
            >
              Remember this account
            </Checkbox>

            <Button
              variant="primary"
              formAction="submit"
              fullWidth
              loading={login.isPending}
              disabled={login.isPending}
              data-testid="sign-in"
            >
              Sign in
            </Button>

            <div className={styles.links}>
              <a href="#" onClick={(event) => event.preventDefault()}>
                Forgot password?
              </a>
              <a href="#" onClick={(event) => event.preventDefault()}>
                Sign in using root user email
              </a>
            </div>
          </SpaceBetween>
        </form>
      </section>

      <div className={styles.hint} data-testid="demo-hint">
        <Alert
          type="info"
          header="Demo credentials"
          action={
            <Button onClick={fillDemo} data-testid="fill-demo">
              Fill in
            </Button>
          }
        >
          <div className={styles.hintGrid}>
            <span>Account ID</span>
            <code>{DEMO_CREDENTIALS.accountId}</code>
            <span>IAM user name</span>
            <code>{DEMO_CREDENTIALS.username}</code>
            <span>Password</span>
            <code>{DEMO_CREDENTIALS.password}</code>
          </div>
        </Alert>
      </div>

      <footer className={styles.footer}>
        <a href="#" onClick={(event) => event.preventDefault()}>
          Terms of Use
        </a>
        <a href="#" onClick={(event) => event.preventDefault()}>
          Privacy Policy
        </a>
        <span>© {new Date().getFullYear()}, Amazon Web Services, Inc. or its affiliates.</span>
      </footer>
    </main>
  );
}
