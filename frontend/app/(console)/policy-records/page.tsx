import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = { title: "Policy records" };

export default function PolicyRecordsPage() {
  return (
    <PagePlaceholder
      title="Policy records"
      breadcrumbs={[{ text: "Traffic flow" }, { text: "Policy records" }]}
    />
  );
}
