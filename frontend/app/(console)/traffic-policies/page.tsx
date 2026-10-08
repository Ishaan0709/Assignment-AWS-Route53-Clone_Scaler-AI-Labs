import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/common/PagePlaceholder";

export const metadata: Metadata = { title: "Traffic policies" };

export default function TrafficPoliciesPage() {
  return (
    <PagePlaceholder
      title="Traffic policies"
      breadcrumbs={[{ text: "Traffic flow" }, { text: "Traffic policies" }]}
    />
  );
}
