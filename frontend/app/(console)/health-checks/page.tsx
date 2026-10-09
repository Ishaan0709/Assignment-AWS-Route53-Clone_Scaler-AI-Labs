import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/ComingSoon";

export const metadata: Metadata = { title: "Health checks" };

export default function HealthChecksPage() {
  return <ComingSoon title="Health checks" breadcrumbs={[{ text: "Health checks" }]} />;
}
