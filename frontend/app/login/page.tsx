import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { FullPageSpinner } from "@/components/common/FullPageStatus";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // useSearchParams() requires a Suspense boundary during static rendering.
  return (
    <Suspense fallback={<FullPageSpinner text="Loading sign-in…" />}>
      <LoginForm />
    </Suspense>
  );
}
