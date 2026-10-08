import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = { title: "Health checks" };

export default function HealthChecksPage() {
  return <PagePlaceholder title="Health checks" breadcrumbs={[{ text: "Health checks" }]} />;
}
