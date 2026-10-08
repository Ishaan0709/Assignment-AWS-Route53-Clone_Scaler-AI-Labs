import { z } from "zod";

/** 12-digit account ID (dashes allowed) or an account alias (3–63 chars, letters/digits/hyphens). */
const ACCOUNT_ID_PATTERN = /^\d{4}-?\d{4}-?\d{4}$/;
const ACCOUNT_ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/i;

export const loginSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1, "Enter your account ID or alias.")
    .refine(
      (value) => ACCOUNT_ID_PATTERN.test(value) || ACCOUNT_ALIAS_PATTERN.test(value),
      "Enter a 12-digit account ID or a valid account alias.",
    ),
  username: z.string().trim().min(1, "Enter your IAM user name.").max(64, "User name is too long."),
  password: z.string().min(1, "Enter your password."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/** Flattens zod issues into `{ fieldName: firstMessage }` for form display. */
export function fieldErrors<T>(result: z.SafeParseReturnType<T, T>): Record<string, string> {
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
